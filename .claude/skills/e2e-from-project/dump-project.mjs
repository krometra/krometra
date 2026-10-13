#!/usr/bin/env node
/**
 * Достаёт историю операций проекта из БД и печатает план e2e-спеки.
 *
 * Читаем Postgres напрямую, а не REST: документ принадлежит живому пользователю,
 * и токена от его сессии у нас нет, а psql в контейнере доступен без авторизации.
 *
 *   node dump-project.mjs http://localhost:5057/editor/<id>
 *   node dump-project.mjs <id> --json
 */

import { execFileSync } from "node:child_process";

const CONTAINER = process.env.CAD_PG_CONTAINER || "cad-studio-postgres";
const DB_USER = process.env.CAD_PG_USER || "cadstudio";
const DB_NAME = process.env.CAD_PG_DB || "cadstudio";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const target = args.find((a) => !a.startsWith("--"));

if (!target) {
  console.error("Использование: node dump-project.mjs <url|project-id> [--json]");
  process.exit(2);
}

const projectId = (target.match(/([0-9a-f]{32}|[0-9a-f-]{36})/i) || [])[1];
if (!projectId) {
  console.error(`Не нашёл id проекта в «${target}»`);
  process.exit(2);
}

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-tAc", sql],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ).trim();
}

const row = psql(
  `select json_build_object('name', p.name, 'timeline', d.timeline, 'components', d.components)::text
   from projects p join documents d on d.project_id = p.id where p.id = '${projectId}'`,
);

if (!row) {
  console.error(
    `Проект ${projectId} в базе не найден — вероятно, удалён. ` +
      `Список последних: docker exec ${CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} ` +
      `-tAc "select p.id, p.name from projects p join documents d on d.project_id=p.id order by d.updated_at desc limit 10;"`,
  );
  process.exit(1);
}

const doc = JSON.parse(row);
const components = doc.components || {};
const timeline = doc.timeline || [];

// ── Разбор эскиза ────────────────────────────────────────────────────────

const isProjectedFaceEdge = (e) => String(e.id || "").startsWith("face-edge-");
const round = (v) => Math.round(v * 1e6) / 1e6;

function asRectangle(lines) {
  if (lines.length !== 4) return null;
  const xs = new Set();
  const ys = new Set();
  for (const l of lines) {
    const horizontal = Math.abs(l.start.y - l.end.y) < 1e-6;
    const vertical = Math.abs(l.start.x - l.end.x) < 1e-6;
    if (!horizontal && !vertical) return null;
    xs.add(round(l.start.x)).add(round(l.end.x));
    ys.add(round(l.start.y)).add(round(l.end.y));
  }
  if (xs.size !== 2 || ys.size !== 2) return null;
  const [x0, x1] = [...xs].sort((a, b) => a - b);
  const [y0, y1] = [...ys].sort((a, b) => a - b);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function describeSketch(sketch) {
  const entities = (sketch.entities || []).filter((e) => !isProjectedFaceEdge(e));
  const drawn = entities.filter((e) => !e.construction);
  const circles = drawn.filter((e) => e.type === "circle");
  const lines = drawn.filter((e) => e.type === "line");
  const other = drawn.filter((e) => e.type !== "circle" && e.type !== "line");

  const steps = [];
  const rect = asRectangle(lines);
  if (rect) {
    steps.push({ call: "drawRect", args: [rect.x, rect.y, rect.width, rect.height] });
  } else if (lines.length) {
    steps.push({
      call: "TODO_lines",
      note: `${lines.length} линий не сложились в прямоугольник — драйвер умеет только drawRect/drawCircle`,
      lines: lines.map((l) => [round(l.start.x), round(l.start.y), round(l.end.x), round(l.end.y)]),
    });
  }
  for (const c of circles) {
    steps.push({ call: "drawCircle", args: [round(c.center.x), round(c.center.y), round(c.radius)] });
  }
  for (const e of other) {
    steps.push({ call: "TODO_entity", note: `примитив «${e.type}» драйвер не умеет рисовать` });
  }

  const constructionCount = entities.filter((e) => e.construction).length;
  return { steps, constructionCount };
}

// ── Эскиз на грани: точки клика и ракурс из базиса грани ─────────────────

const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, k) => a.map((v) => v * k);

function facePlacement(sketch) {
  const basis = sketch.plane_basis;
  if (!basis) return null;
  const boundary = (sketch.entities || []).filter(isProjectedFaceEdge);
  if (!boundary.length) return null;

  const pts = boundary.flatMap((e) => [
    [e.start.x, e.start.y],
    [e.end.x, e.end.y],
  ]);
  const cu = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cv = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const extent = Math.max(
    ...pts.map((p) => Math.hypot(p[0] - cu, p[1] - cv)),
    1,
  );

  const to3d = (u, v) =>
    add(add(basis.origin, scale(basis.u, u)), scale(basis.v, v)).map(round);

  // Три точки вокруг центра: первая же может попасть на ребро или в отверстие.
  const spots = [
    to3d(cu, cv),
    to3d(cu + extent * 0.35, cv),
    to3d(cu, cv + extent * 0.35),
  ];
  const distance = extent * 4;
  const camera = add(
    to3d(cu, cv),
    add(scale(basis.n, distance), add(scale(basis.u, distance * 0.4), scale(basis.v, distance * 0.4))),
  ).map((v) => Math.round(v));

  return { camera, spots };
}

// ── Выдавливание: знак расстояния → модуль + реверс ──────────────────────

function describeExtrude(params) {
  const distance = Number(params.distance ?? 0);
  const operation = params.operation || "new_body";
  const defaultSign = operation === "cut" ? -1 : 1;
  const opts = {
    distance: Math.abs(distance),
    operation,
    direction: params.direction || "one_side",
  };
  if (Math.sign(distance || 1) !== defaultSign) opts.reversed = true;
  if (params.extent_type === "through_all") opts.extentType = "through_all";
  return opts;
}

// ── Сборка плана ─────────────────────────────────────────────────────────

const plan = [];
for (const entry of timeline) {
  if (entry.kind === "sketch") {
    const sketch = components[entry.sketch_id] || {};
    const { steps, constructionCount } = describeSketch(sketch);
    plan.push({
      kind: "sketch",
      label: entry.label,
      plane: sketch.plane || entry.plane || "XY",
      planeOffset: sketch.plane_offset || 0,
      onFace: Boolean(sketch.ref_body_id),
      placement: sketch.ref_body_id ? facePlacement(sketch) : null,
      steps,
      constructionCount,
    });
  } else if (entry.kind === "extrude") {
    plan.push({ kind: "extrude", label: entry.label, opts: describeExtrude(entry.params || {}) });
  } else if (entry.kind === "revolve") {
    plan.push({ kind: "revolve", label: entry.label, params: entry.params || {} });
  } else if (entry.kind === "fillet" || entry.kind === "chamfer") {
    const params = entry.params || {};
    plan.push({
      kind: entry.kind,
      label: entry.label,
      radius: params.radius,
      distance1: params.distance1,
      distance2: params.distance2,
      edgeCount: (params.edge_ids || []).length,
      edgeIds: params.edge_ids || [],
    });
  } else {
    plan.push({ kind: entry.kind, label: entry.label, params: entry.params || {} });
  }
}

if (asJson) {
  console.log(JSON.stringify({ projectId, name: doc.name, plan }, null, 2));
  process.exit(0);
}

// ── Печать: план + готовый черновик шагов ────────────────────────────────

const out = [];
out.push(`Проект: ${doc.name} (${projectId})`);
out.push(`Операций в дереве: ${timeline.length}`);
out.push("");

const code = [];
for (const step of plan) {
  if (step.kind === "sketch") {
    const where = step.onFace ? "на грани тела" : `на плоскости ${step.plane}`;
    out.push(`${step.label}: эскиз ${where}, ${step.steps.length} примитив(ов)` +
      (step.constructionCount ? `, вспомогательных ${step.constructionCount}` : ""));
    if (step.onFace) {
      if (step.placement) {
        code.push(`  await cad.startSketchOnFace(`);
        code.push(`    [${step.placement.camera.join(", ")}],`);
        code.push(`    [${step.placement.spots.map((s) => `[${s.join(", ")}]`).join(", ")}],`);
        code.push(`  );`);
      } else {
        code.push(`  // TODO эскиз на грани: в документе нет plane_basis, подбери ракурс и точки клика`);
        code.push(`  await cad.startSketchOnFace([0, 0, 0], [[0, 0, 0]]);`);
      }
    } else if (step.planeOffset) {
      code.push(`  // TODO эскиз на плоскости ${step.plane} со смещением ${step.planeOffset} — драйвер умеет только базовую плоскость`);
      code.push(`  await cad.startSketchOnBasePlane();`);
    } else {
      code.push(`  await cad.startSketchOnBasePlane();`);
    }
    for (const s of step.steps) {
      if (s.call === "drawRect" || s.call === "drawCircle") {
        code.push(`  await cad.${s.call}(${s.args.join(", ")});`);
      } else {
        code.push(`  // TODO ${s.note}`);
        if (s.lines) for (const l of s.lines) code.push(`  //   линия ${l.join(" → ")}`);
      }
    }
    code.push(`  await cad.finishSketch();`);
  } else if (step.kind === "extrude") {
    const o = step.opts;
    const parts = [`distance: ${o.distance}`];
    if (o.operation !== "new_body") parts.push(`operation: "${o.operation}"`);
    parts.push(`direction: "${o.direction}"`);
    if (o.reversed) parts.push(`reversed: true`);
    out.push(`${step.label}: ${o.operation}, ${o.distance} мм, ${o.direction}` +
      (o.reversed ? ", реверс" : "") + (o.extentType ? ", насквозь" : ""));
    if (o.extentType) code.push(`  // TODO «насквозь»: драйвер задаёт только расстояние`);
    code.push(`  await cad.extrude({ ${parts.join(", ")} });`);
  } else if (step.kind === "fillet" || step.kind === "chamfer") {
    const size = step.kind === "fillet" ? `R${step.radius}` : `${step.distance1}×${step.distance2}`;
    out.push(`${step.label}: ${step.kind} ${size} по ${step.edgeCount} ребру(ам)`);
    code.push(``);
    code.push(`  // ${step.label}: ${size}, рёбер ${step.edgeCount}.`);
    code.push(`  // Имена рёбер (${step.edgeIds.slice(0, 4).join(", ")}${step.edgeIds.length > 4 ? ", …" : ""})`);
    code.push(`  // в новом прогоне не воспроизводятся — выбери их по геометрии:`);
    code.push(`  const topo${plan.indexOf(step)} = await cad.topology();`);
    code.push(`  const edges${plan.indexOf(step)} = /* TODO: edgesAtZ / verticalEdges / nearAnyXY */ [];`);
    code.push(`  expect(edges${plan.indexOf(step)}, "рёбра для ${step.label}").toHaveLength(${step.edgeCount});`);
    code.push(`  await cad.fillet(edges${plan.indexOf(step)}.map((e) => e.id), ${step.radius ?? step.distance1});`);
    code.push(``);
  } else {
    out.push(`${step.label}: операция «${step.kind}» — драйвера нет`);
    code.push(`  // TODO операция «${step.kind}»: ${JSON.stringify(step.params)}`);
  }
}

out.push("");
out.push("─".repeat(60));
out.push("Черновик шагов спеки:");
out.push("");
out.push(code.join("\n"));

console.log(out.join("\n"));
