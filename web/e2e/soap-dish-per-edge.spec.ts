import { expect, test } from "@playwright/test";
import { CadEditor, verticalEdges, type Edge, type Topology } from "./helpers/cad";

/**
 * Та же подставка для мыла, но каждое ребро скругляется ОТДЕЛЬНОЙ операцией:
 * выбрал ребро → применил → выбрал следующее → применил. Так работает живой
 * пользователь, и так проверяется главное обещание persistent naming: после
 * скругления остальные рёбра тела должны остаться выбираемыми и целыми.
 *
 * Рёбра ищутся по координатам заново перед каждой операцией — id после
 * перестроения меняться права не имеет, но тест на него не опирается.
 */

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const BASE = 80;
const HEIGHT = 15;
const TOP_Z = HEIGHT / 2;
const BOTTOM_Z = -HEIGHT / 2;

const CAVITY = 64;
const CAVITY_DEPTH = 10;
const FLOOR_Z = TOP_Z - CAVITY_DEPTH;

const CORNER_R = 6;

const TOP_VIEW = [70, 70, 170];
const TOP_SPOTS: [number, number, number][] = [
  [25, 25, TOP_Z],
  [28, 20, TOP_Z],
  [20, 28, TOP_Z],
];

/** Угловое ребро: обе координаты у самого угла — касательные рёбра скругления отсеиваются. */
function cornerEdges(topo: Topology, zLow: number, zHigh: number, half: number): Edge[] {
  const atCorner = (e: Edge) =>
    Math.abs(e.a[0]) > half - 1 && Math.abs(e.a[1]) > half - 1;
  return verticalEdges(topo, zLow, zHigh).filter(atCorner);
}

test("скругления по одному ребру за раз: каждая операция видит актуальную топологию", async ({
  page,
}) => {
  test.setTimeout(15 * 60_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-soap-per-edge");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(-BASE / 2, -BASE / 2, BASE, BASE);
  await cad.finishSketch();
  await cad.extrude({ distance: HEIGHT, direction: "symmetric" });

  await cad.startSketchOnFace(TOP_VIEW, TOP_SPOTS);
  await cad.drawRect(-CAVITY / 2, -CAVITY / 2, CAVITY, CAVITY);
  await cad.finishSketch();
  await cad.extrude({ distance: CAVITY_DEPTH, operation: "cut", direction: "one_side" });

  let topo = await cad.topology();
  expect(topo.zLevels, "дно кармана").toContain(FLOOR_Z);
  expect(await cad.visibleBodyCount(), "видимое тело ровно одно").toBe(1);

  // ── Четыре наружных угла: по одной операции на угол ────────────────────
  for (let i = 0; i < 4; i++) {
    topo = await cad.topology();
    const corners = cornerEdges(topo, BOTTOM_Z, TOP_Z, BASE / 2);
    expect(corners, `перед скруглением ${i + 1} осталось нескруглённых углов`).toHaveLength(4 - i);

    await cad.fillet([corners[0].id], CORNER_R);

    expect(await cad.visibleBodyCount(), `после наружного угла ${i + 1} одно тело`).toBe(1);
    const statuses = (await cad.timeline()).filter((t) => t.kind === "fillet").map((t) => t.status);
    expect(statuses, `статусы скруглений после угла ${i + 1}`).toEqual(
      Array(i + 1).fill("ok"),
    );
  }

  // ── Четыре угла кармана: тоже по одному ────────────────────────────────
  for (let i = 0; i < 4; i++) {
    topo = await cad.topology();
    const corners = cornerEdges(topo, FLOOR_Z, TOP_Z, CAVITY / 2);
    expect(corners, `перед скруглением кармана ${i + 1}`).toHaveLength(4 - i);

    await cad.fillet([corners[0].id], CORNER_R);

    expect(await cad.visibleBodyCount(), `после угла кармана ${i + 1} одно тело`).toBe(1);
  }

  // ── Итог: восемь операций, тело цело ───────────────────────────────────
  const timeline = await cad.timeline();
  expect(timeline.filter((t) => t.kind === "fillet"), "восемь скруглений").toHaveLength(8);
  expect(timeline.filter((t) => t.status !== "ok"), "все операции успешны").toEqual([]);

  topo = await cad.topology();
  expect(topo.bbox.max[0] - topo.bbox.min[0]).toBeCloseTo(BASE, 1);
  expect(topo.bbox.max[2] - topo.bbox.min[2]).toBeCloseTo(HEIGHT, 1);
  expect(topo.zLevels, "дно кармана на месте").toContain(FLOOR_Z);
  expect(cornerEdges(topo, BOTTOM_Z, TOP_Z, BASE / 2), "острых наружных углов не осталось").toHaveLength(0);
  expect(await cad.visibleBodyCount()).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("имена рёбер, взятые до серии операций, переживают каждое скругление", async ({ page }) => {
  test.setTimeout(15 * 60_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-soap-stable-names");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(-BASE / 2, -BASE / 2, BASE, BASE);
  await cad.finishSketch();
  await cad.extrude({ distance: HEIGHT, direction: "symmetric" });

  await cad.startSketchOnFace(TOP_VIEW, TOP_SPOTS);
  await cad.drawRect(-CAVITY / 2, -CAVITY / 2, CAVITY, CAVITY);
  await cad.finishSketch();
  await cad.extrude({ distance: CAVITY_DEPTH, operation: "cut", direction: "one_side" });

  // Обещание persistent naming: id, полученные ДО серии операций, остаются
  // валидными после каждого перестроения — пользователь целится в те же рёбра.
  const cornerIds = cornerEdges(await cad.topology(), BOTTOM_Z, TOP_Z, BASE / 2).map((e) => e.id);
  expect(cornerIds, "четыре наружных угла").toHaveLength(4);

  for (const [i, edgeId] of cornerIds.entries()) {
    const topo = await cad.topology();
    expect(
      topo.edges.map((e) => e.id),
      `ребро ${edgeId} доступно перед операцией ${i + 1}`,
    ).toContain(edgeId);

    await cad.fillet([edgeId], CORNER_R);

    const statuses = (await cad.timeline()).filter((t) => t.kind === "fillet").map((t) => t.status);
    expect(statuses, `статусы после операции ${i + 1}`).toEqual(Array(i + 1).fill("ok"));
    expect(await cad.visibleBodyCount(), `после операции ${i + 1} одно тело`).toBe(1);
  }

  const topo = await cad.topology();
  expect(cornerEdges(topo, BOTTOM_Z, TOP_Z, BASE / 2), "острых углов не осталось").toHaveLength(0);
  expect(topo.bbox.max[2] - topo.bbox.min[2]).toBeCloseTo(HEIGHT, 1);
  expect(topo.zLevels, "дно кармана на месте").toContain(FLOOR_Z);
  expect(pageErrors).toEqual([]);
});
