import { setTimeout as delay } from "node:timers/promises";
import { ToolError } from "./errors.mjs";
import { collectAnchors, formatLegend, normalizeProjection, planLabels, sameProjection } from "./labels.mjs";
import { readPngSize } from "./png.mjs";

const STABILITY_ATTEMPTS = 3;
const SETTLE_MS = 250;
const PNG_MIME = "image/png";
const KIND_NAMES = { edges: "рёбер", faces: "граней" };
const COLORS = { accent: "#ff3b6b", background: "#111418", text: "#ffffff" };

function markStyle(metrics) {
  return {
    ...COLORS,
    font: `600 ${metrics.fontSize}px ui-monospace, Menlo, Consolas, monospace`,
    padding: metrics.padding,
    dotRadius: metrics.dotRadius,
    lineWidth: Math.max(1, Math.round(metrics.fontSize / 12)),
  };
}

export async function captureViewport(editor) {
  const shot = await editor.query("viewport.capture");
  if (typeof shot?.dataBase64 !== "string" || !shot.dataBase64) {
    throw new ToolError("viewport.capture не вернул dataBase64.");
  }
  return { mime: shot.mime ?? PNG_MIME, dataBase64: shot.dataBase64 };
}

async function project(editor, points) {
  return normalizeProjection(await editor.query("viewport.project", { points }), points.length);
}

async function captureWithProjection(editor, points) {
  for (let attempt = 1; ; attempt += 1) {
    const before = await project(editor, points);
    const shot = await captureViewport(editor);
    const projection = await project(editor, points);
    const stable = sameProjection(before, projection);
    if (stable || attempt === STABILITY_ATTEMPTS) return { shot, projection, stable };
    await delay(SETTLE_MS);
  }
}

function describeBody(body) {
  return `${body.id} (${body.name}${body.visible ? "" : ", скрыто"})`;
}

async function resolveBodyId(editor, requested) {
  if (requested) return requested;
  const { bodies = [] } = await editor.query("state");
  const visible = bodies.filter((body) => body.visible);
  if (visible.length === 1) return visible[0].id;
  throw new ToolError(
    `Укажи body_id: видимых тел ${visible.length}. Тела проекта: ${bodies.map(describeBody).join(", ") || "нет"}.`,
  );
}

export async function captureLabeled(editor, { kind, bodyId, labelText }) {
  const body = await resolveBodyId(editor, bodyId);
  const { anchors, unplaced } = collectAnchors(await editor.query("topology", { bodyId: body }), kind);
  if (!anchors.length) {
    throw new ToolError(`У тела ${body} нет ${KIND_NAMES[kind]} для подписи: сними вьюпорт без подписей.`);
  }
  const { shot, projection, stable } = await captureWithProjection(
    editor,
    anchors.map((anchor) => anchor.point),
  );
  const image = readPngSize(shot.dataBase64);
  if (!image) throw new ToolError(`viewport.capture вернул не PNG (${shot.mime}): подписи наносятся только на PNG.`);
  const plan = planLabels({ anchors, projection, image, labelText });
  const drawn = await editor.query("image.drawLabels", {
    dataBase64: shot.dataBase64,
    marks: plan.marks,
    style: markStyle(plan.metrics),
  });
  return {
    shot: { mime: PNG_MIME, dataBase64: drawn.dataBase64 },
    legend: formatLegend({ bodyId: body, kind, image, plan, unplaced, stable }),
  };
}
