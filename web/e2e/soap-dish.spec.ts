import { expect, test } from "@playwright/test";
import { CadEditor, edgesAtZ, maxXY, nearAnyXY, verticalEdges } from "./helpers/cad";

/**
 * Сквозной сценарий реального моделирования: подставка для мыла.
 *
 *   основание 80×80×15  →  карман 64×64 глубиной 10 (эскиз на верхней грани)
 *   →  скругления R6 (наружные и внутренние углы), R3 (дно кармана),
 *      R2 (верхний борт и нижняя кромка)
 *   →  четыре углубления под ножки Ø6×2 в основании
 *
 * Всё делается мышью и клавиатурой в редакторе; геометрия проверяется по мешу
 * с сервера. Найденные по ходу проблемы — в .docs/ROADMAP.md, «Живой прогон 16.08.2026».
 */

// Свой логин через page.request: переиспользование refresh-cookie из
// storageState параллельно с другими спеками ловит replay-защиту.
test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const BASE = 80; // сторона основания, мм
const HEIGHT = 15;
// Деталь строится симметрично относительно XY: иначе её нижняя грань лежит
// ровно в базовой плоскости XY, хелпер этой плоскости перехватывает клик,
// и эскиз под ножки не привязывается к телу (ROADMAP, «Живой прогон 16.08.2026»).
const TOP_Z = HEIGHT / 2;
const BOTTOM_Z = -HEIGHT / 2;

const CAVITY = 64;
const CAVITY_DEPTH = 10;
const FLOOR_Z = TOP_Z - CAVITY_DEPTH;

const FOOT_R = 3; // ножки Ø6
const FOOT_DEPTH = 2;
const FOOT_FLOOR_Z = BOTTOM_Z + FOOT_DEPTH;
const FEET = [
  [-28, -28],
  [28, -28],
  [28, 28],
  [-28, 28],
];

const TOP_VIEW = [70, 70, 170];
const BOTTOM_VIEW = [70, 70, -170];
const TOP_SPOTS: [number, number, number][] = [
  [25, 25, TOP_Z],
  [28, 20, TOP_Z],
  [20, 28, TOP_Z],
];
const BOTTOM_SPOTS: [number, number, number][] = [
  [25, 25, BOTTOM_Z],
  [28, 20, BOTTOM_Z],
  [20, 28, BOTTOM_Z],
];

test("подставка для мыла: эскиз → выдавливание → эскиз на грани → вырез → скругления → ножки", async ({
  page,
}) => {
  test.setTimeout(12 * 60_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-soap-dish");

  // ── 1. Основание: квадрат 80×80 на XY, выдавливание 15 мм симметрично ──
  await cad.startSketchOnBasePlane();
  await cad.drawRect(-BASE / 2, -BASE / 2, BASE, BASE);

  const square = await cad.sketchEntities();
  expect(square.filter((e) => e.type === "line" && !e.construction)).toHaveLength(4);

  await cad.finishSketch();
  await cad.extrude({ distance: HEIGHT, direction: "symmetric" });

  let topo = await cad.topology();
  expect(topo.faces, "коробка из шести граней").toBe(6);
  expect(topo.bbox.max[2] - topo.bbox.min[2]).toBeCloseTo(HEIGHT, 1);
  expect(topo.bbox.max[0] - topo.bbox.min[0]).toBeCloseTo(BASE, 1);
  expect(topo.bbox.max[2]).toBeCloseTo(TOP_Z, 1);

  // ── 2. Карман: эскиз на верхней грани, вырез 10 мм ─────────────────────
  await cad.startSketchOnFace(TOP_VIEW, TOP_SPOTS);

  const faceSketch = await cad.sketchEntities();
  expect(
    faceSketch.filter((e) => e.construction).length,
    "контур грани приходит линиями построения",
  ).toBeGreaterThan(0);

  await cad.drawRect(-CAVITY / 2, -CAVITY / 2, CAVITY, CAVITY);
  await cad.finishSketch();

  // Минус: нормаль эскиза на грани смотрит наружу тела, вырез идёт против неё
  // (положительное расстояние тихо не режет ничего — ROADMAP, «Живой прогон 16.08.2026»).
  await cad.extrude({ distance: CAVITY_DEPTH, operation: "cut", direction: "one_side" });

  topo = await cad.topology();
  expect(topo.zLevels, "появилось дно кармана").toContain(FLOOR_Z);
  expect(topo.faces, "5 наружных + борт + 4 стенки + дно").toBe(11);
  expect(await cad.visibleBodyCount(), "видимое тело ровно одно").toBe(1);

  // ── 3. Скругления ─────────────────────────────────────────────────────
  // Каждый раз пересобираем список рёбер: после скругления имена меняются.

  topo = await cad.topology();
  const outerCorners = verticalEdges(topo, BOTTOM_Z, TOP_Z).filter((e) => maxXY(e) > BASE / 2 - 1);
  expect(outerCorners, "четыре наружных угла").toHaveLength(4);
  await cad.fillet(
    outerCorners.map((e) => e.id),
    6,
  );

  topo = await cad.topology();
  const innerCorners = verticalEdges(topo, FLOOR_Z, TOP_Z);
  expect(innerCorners, "четыре угла кармана").toHaveLength(4);
  await cad.fillet(
    innerCorners.map((e) => e.id),
    6,
  );

  // дно кармана: после скругления углов петля из 4 прямых + 4 дуг
  topo = await cad.topology();
  const cavityFloor = edgesAtZ(topo, FLOOR_Z);
  expect(cavityFloor, "петля дна кармана").toHaveLength(8);
  await cad.fillet(
    cavityFloor.map((e) => e.id),
    3,
  );

  // верхний борт: наружная и внутренняя кромки
  topo = await cad.topology();
  const rim = edgesAtZ(topo, TOP_Z);
  expect(rim, "две петли верхнего борта").toHaveLength(16);
  await cad.fillet(
    rim.map((e) => e.id),
    2,
  );

  const fillets = (await cad.timeline()).filter((t) => t.kind === "fillet");
  expect(fillets.map((f) => f.status)).toEqual(["ok", "ok", "ok", "ok"]);

  // ── 4. Четыре углубления под ножки Ø6×2 в основании ───────────────────
  // По одному эскизу на ножку — четыре выреза подряд по одному телу;
  // те же ножки одним эскизом проверяет спека ниже.
  for (const [fx, fy] of FEET) {
    await cad.startSketchOnFace(BOTTOM_VIEW, BOTTOM_SPOTS);
    await cad.drawCircle(fx, fy, FOOT_R);

    // Линии построения от контура грани тоже бывают окружностями (скруглённые
    // углы) — считаем только нарисованную геометрию.
    const circles = (await cad.sketchEntities()).filter(
      (e) => e.type === "circle" && !e.construction,
    );
    expect(circles).toHaveLength(1);
    expect(circles[0].radius).toBeCloseTo(FOOT_R, 1);

    await cad.finishSketch();
    await cad.extrude({ distance: FOOT_DEPTH, operation: "cut", direction: "one_side" });

    // Вырез, ушедший в устаревшее тело, оставляет в сцене две ветки модели —
    // снаружи это выглядит как «часть отверстий пропала» (ROADMAP, «Живой прогон 16.08.2026»).
    expect(await cad.visibleBodyCount(), `после ножки ${fx},${fy} одно тело`).toBe(1);
  }

  topo = await cad.topology();
  expect(topo.zLevels, "дно углублений под ножки").toContain(FOOT_FLOOR_Z);
  const footRims = edgesAtZ(topo, BOTTOM_Z).filter((e) => nearAnyXY(e, FEET, FOOT_R + 2));
  expect(footRims, "четыре кромки углублений").toHaveLength(4);

  // ── 5. Скругление нижней кромки ───────────────────────────────────────
  const bottomRim = edgesAtZ(topo, BOTTOM_Z).filter((e) => !nearAnyXY(e, FEET, FOOT_R + 2));
  expect(bottomRim, "петля нижней кромки без кромок ножек").toHaveLength(8);
  await cad.fillet(
    bottomRim.map((e) => e.id),
    2,
  );

  // ── Итог ──────────────────────────────────────────────────────────────
  const timeline = await cad.timeline();
  expect(timeline.filter((t) => t.status !== "ok"), "все операции успешны").toEqual([]);
  expect(timeline.filter((t) => t.kind === "extrude")).toHaveLength(6);
  expect(timeline.filter((t) => t.kind === "fillet")).toHaveLength(5);

  topo = await cad.topology();
  expect(topo.bbox.max[0] - topo.bbox.min[0]).toBeCloseTo(BASE, 1);
  expect(topo.bbox.max[2] - topo.bbox.min[2]).toBeCloseTo(HEIGHT, 1);
  expect(await cad.visibleBodyCount()).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("вырез по грани режет вглубь тела, а промах мимо тела — ошибка, а не успех", async ({
  page,
}) => {
  test.setTimeout(5 * 60_000);
  const cad = await CadEditor.open(page, "e2e-soap-cut-direction");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(-BASE / 2, -BASE / 2, BASE, BASE);
  await cad.finishSketch();
  await cad.extrude({ distance: HEIGHT, direction: "symmetric" });

  await cad.startSketchOnFace(TOP_VIEW, TOP_SPOTS);
  await cad.drawRect(-CAVITY / 2, -CAVITY / 2, CAVITY, CAVITY);
  await cad.finishSketch();

  // Реверс уводит вырез наружу от грани: тело не меняется, и это должно быть видно.
  await cad.extrudeExpectingError(
    { distance: CAVITY_DEPTH, operation: "cut", direction: "one_side", reversed: true },
    /не изменил объём тела/,
  );

  await cad.extrude({ distance: CAVITY_DEPTH, operation: "cut", direction: "one_side" });

  expect((await cad.topology()).zLevels).toContain(FLOOR_Z);
  expect(await cad.visibleBodyCount()).toBe(1);
});

test("четыре окружности в одном эскизе вырезаются одной операцией", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const cad = await CadEditor.open(page, "e2e-soap-multi-profile");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(-BASE / 2, -BASE / 2, BASE, BASE);
  await cad.finishSketch();
  await cad.extrude({ distance: HEIGHT, direction: "symmetric" });

  await cad.startSketchOnFace(BOTTOM_VIEW, BOTTOM_SPOTS);
  for (const [fx, fy] of FEET) await cad.drawCircle(fx, fy, FOOT_R);
  await cad.finishSketch();
  await cad.extrude({ distance: FOOT_DEPTH, operation: "cut", direction: "one_side" });

  const topo = await cad.topology();
  expect(topo.zLevels).toContain(FOOT_FLOOR_Z);
  expect(edgesAtZ(topo, BOTTOM_Z).filter((e) => nearAnyXY(e, FEET, FOOT_R + 2))).toHaveLength(4);
  expect(await cad.visibleBodyCount()).toBe(1);
});
