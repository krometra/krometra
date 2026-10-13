import { expect, test } from "@playwright/test";
import { CadEditor, edgesAtZ, nearAnyXY } from "./helpers/cad";

/**
 * Несколько замкнутых контуров в одном эскизе.
 *
 * Раньше ядро собирало из всех примитивов эскиза один wire и отвечало
 * «В эскизе 2 замкнутых контура — пока поддерживается один»: два отверстия
 * приходилось разносить по разным эскизам. Теперь несвязанные контуры дают
 * отдельные тела инструмента, вложенный — отверстие в грани.
 */

// Свой логин: переиспользование refresh-cookie из storageState параллельно
// с другими спеками ловит replay-защиту.
test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const PLATE = 50;
const THICK = 10;
// Деталь симметрична относительно XY: грань ровно в базовой плоскости
// перехватывает клик хелпера, и эскиз не привязывается к телу.
const TOP_Z = THICK / 2;
const BOTTOM_Z = -THICK / 2;

const HOLE_R = 3;
const HOLES = [
  [-12, 0],
  [12, 0],
];

const TOP_VIEW = [45, 45, 110];
const TOP_SPOTS: [number, number, number][] = [
  [18, 18, TOP_Z],
  [20, 14, TOP_Z],
  [14, 20, TOP_Z],
];

test("два отверстия одним эскизом вырезаются одной операцией", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-multi-contour-cut");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(-PLATE / 2, -PLATE / 2, PLATE, PLATE);
  await cad.finishSketch();
  await cad.extrude({ distance: THICK, direction: "symmetric" });

  await cad.startSketchOnFace(TOP_VIEW, TOP_SPOTS);
  for (const [x, y] of HOLES) await cad.drawCircle(x, y, HOLE_R);

  const circles = (await cad.sketchEntities()).filter((e) => e.type === "circle");
  expect(circles, "две окружности в одном эскизе").toHaveLength(2);

  await cad.finishSketch();
  await cad.extrude({ distance: THICK, operation: "cut", direction: "one_side" });

  const topo = await cad.topology();
  expect(topo.faces, "6 граней плиты + два цилиндра отверстий").toBe(8);
  expect(
    edgesAtZ(topo, TOP_Z).filter((e) => nearAnyXY(e, HOLES, HOLE_R + 1)),
    "две кромки сверху",
  ).toHaveLength(2);
  expect(
    edgesAtZ(topo, BOTTOM_Z).filter((e) => nearAnyXY(e, HOLES, HOLE_R + 1)),
    "отверстия сквозные — две кромки снизу",
  ).toHaveLength(2);
  expect(await cad.visibleBodyCount(), "видимое тело ровно одно").toBe(1);

  const timeline = await cad.timeline();
  expect(timeline.filter((t) => t.status !== "ok"), "все операции успешны").toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("контур внутри контура выдавливается телом с отверстием", async ({ page }) => {
  test.setTimeout(5 * 60_000);

  const cad = await CadEditor.open(page, "e2e-multi-contour-washer");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(-PLATE / 2, -PLATE / 2, PLATE, PLATE);
  await cad.drawCircle(0, 0, 8);
  await cad.finishSketch();
  await cad.extrude({ distance: THICK, direction: "symmetric" });

  const topo = await cad.topology();
  expect(topo.faces, "6 граней плиты + цилиндр отверстия").toBe(7);
  expect(topo.bbox.max[0] - topo.bbox.min[0]).toBeCloseTo(PLATE, 1);
  expect(
    edgesAtZ(topo, TOP_Z).filter((e) => nearAnyXY(e, [[0, 0]], 9)),
    "кромка отверстия сверху",
  ).toHaveLength(1);
  expect(await cad.visibleBodyCount()).toBe(1);
});
