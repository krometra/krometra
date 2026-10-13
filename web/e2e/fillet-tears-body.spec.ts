import { expect, test } from "@playwright/test";
import { CadEditor, edgesAtZ, verticalEdges, type Edge } from "./helpers/cad";

/**
 * Скругление разносит тело в клочья («розетка подстольная», 16.08.2026).
 *
 * Стойка приклеена к плите заподлицо с её боковой гранью, поэтому вертикальное
 * ребро стойки упирается в верхнее ребро плиты. Скругление этой пары R2 сразу
 * OCCT «строит»: BRepFilletAPI отдаёт IsDone() = true, но форма выходит
 * самопересекающейся — габарит тела 50×50×50 раздувается до сотен миллиметров.
 * Результат никто не проверяет, и рваная геометрия уезжает в MinIO и в документ.
 *
 * В живом документе таких рёбер было 14, но рвут модель ровно эти два —
 * остальные скругляются поодиночке без последствий.
 */

// Свой логин: переиспользование refresh-cookie параллельно с другими спеками
// ловит replay-защиту.
test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const PLATE = 50;
const THICK = 10;
// Деталь симметрична относительно XY: грань ровно в базовой плоскости
// перехватывает клик хелпера, и эскиз не привязывается к телу.
const TOP_Z = THICK / 2;
const HALF = PLATE / 2;

const POST_W = 12;
const POST_D = 20;
const POST_H = 40;
const POST_TOP_Z = TOP_Z + POST_H;
const POST_INNER_Y = HALF - POST_D;

const RADIUS = 2;

const TOP_VIEW = [45, -60, 110];
const TOP_SPOTS: [number, number, number][] = [
  [0, -14, TOP_Z],
  [6, -18, TOP_Z],
  [-6, -18, TOP_Z],
];

const near = (a: number, b: number, eps = 0.3) => Math.abs(a - b) < eps;

const touches = (e: Edge, p: number[]) =>
  [e.a, e.b].some((v) => v.every((c, i) => near(c, p[i])));

test("скругление стойки у основания не разрывает тело", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-fillet-tears-body");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(-HALF, -HALF, PLATE, PLATE);
  await cad.finishSketch();
  await cad.extrude({ distance: THICK, direction: "symmetric" });

  // Две стойки одним эскизом, каждая заподлицо со своей боковой гранью плиты.
  await cad.startSketchOnFace(TOP_VIEW, TOP_SPOTS);
  await cad.drawRect(HALF - POST_W, POST_INNER_Y, POST_W, POST_D);
  await cad.drawRect(-HALF, POST_INNER_Y, POST_W, POST_D);
  await cad.finishSketch();
  await cad.extrude({ distance: POST_H, operation: "join", direction: "one_side" });

  const before = await cad.topology();
  expect(before.bbox.max[2] - before.bbox.min[2], "плита со стойками").toBeCloseTo(
    THICK + POST_H,
    1,
  );
  expect(before.openEdges, "до скругления меш замкнут").toBe(0);

  // Вертикальное ребро стойки на грани, общей с плитой, и верхнее ребро плиты,
  // которое в него упирается.
  const postCorners = verticalEdges(before, TOP_Z, POST_TOP_Z).filter(
    (e) => near(Math.abs(e.a[0]), HALF) && near(Math.abs(e.a[1]), Math.abs(POST_INNER_Y)),
  );
  expect(postCorners, "внутренние углы стоек на боковых гранях плиты").toHaveLength(2);

  const post = postCorners[0];
  const foot = [post.a[0], post.a[1], TOP_Z];
  // Ребро от угла плиты до подошвы стойки, а не шов между их совпавшими гранями.
  const plateCorner = [foot[0], -Math.sign(foot[1]) * HALF, TOP_Z];
  const plateEdges = edgesAtZ(before, TOP_Z).filter(
    (e) => touches(e, foot) && touches(e, plateCorner),
  );
  expect(plateEdges, "верхнее ребро плиты, упирающееся в стойку").toHaveLength(1);

  const error = await cad.filletOutcome([post.id, plateEdges[0].id], RADIUS);

  if (error) {
    expect(error, "отказ объясняется по-русски, а не как Fillet failed").not.toMatch(
      /Fillet failed/,
    );
  } else {
    const after = await cad.topology();
    expect(after.openEdges, "меш тела остался замкнутым").toBe(0);
    for (const axis of [0, 1, 2]) {
      expect(after.bbox.min[axis], `габарит по оси ${axis} не пополз вниз`).toBeGreaterThan(
        before.bbox.min[axis] - 0.01,
      );
      expect(after.bbox.max[axis], `габарит по оси ${axis} не пополз вверх`).toBeLessThan(
        before.bbox.max[axis] + 0.01,
      );
    }
    expect(await cad.visibleBodyCount(), "видимое тело ровно одно").toBe(1);
  }

  const timeline = await cad.timeline();
  expect(timeline.filter((t) => t.status !== "ok"), "все операции успешны").toEqual([]);
  expect(pageErrors).toEqual([]);
});
