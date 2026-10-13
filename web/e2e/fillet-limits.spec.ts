import { expect, test } from "@playwright/test";
import { CadEditor, type Edge } from "./helpers/cad";

/**
 * Скруглить 11 рёбер куба, а потом двенадцатое: BRepFilletAPI не умеет
 * пристраивать скругление к уже построенному соседнему и падает («Fillet failed
 * with radius=5.0 on 1 edge(s)»), хотя те же 12 рёбер одним билдером строятся.
 *
 * Поэтому неудачное скругление пересобирается от родительской формы со всеми
 * рёбрами сразу, а две операции дерева схлопываются в одну — как в Fusion.
 */

test.use({ viewport: { width: 1680, height: 1000 } });

const SIDE = 20;
const RADIUS = 5;

const midpoint = (e: Edge) => e.a.map((v, i) => (v + e.b[i]) / 2);

const distance = (p: number[], q: number[]) =>
  Math.hypot(...p.map((v, i) => v - q[i]));

test("двенадцатое ребро куба скругляется после первых одиннадцати", async ({ page }) => {
  test.setTimeout(10 * 60_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-fillet-last-edge");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(-SIDE / 2, -SIDE / 2, SIDE, SIDE);
  await cad.finishSketch();
  await cad.extrude({ distance: SIDE, direction: "symmetric" });

  const cube = await cad.topology();
  expect(cube.edges, "у куба двенадцать рёбер").toHaveLength(12);

  const spared = cube.edges[cube.edges.length - 1];
  const sparedMid = midpoint(spared);

  await cad.fillet(
    cube.edges.slice(0, -1).map((e) => e.id),
    RADIUS,
  );

  const rounded = await cad.topology();
  const survivor = rounded.edges
    .map((e) => ({ e, d: distance(midpoint(e), sparedMid) }))
    .sort((x, y) => x.d - y.d)[0];
  expect(survivor.d, "нескруглённое ребро осталось на своём месте").toBeLessThan(0.5);

  await cad.fillet([survivor.e.id], RADIUS);

  const final = await cad.topology();
  const stillFlat = final.edges
    .map((e) => distance(midpoint(e), sparedMid))
    .filter((d) => d < 0.5);
  expect(stillFlat, "прямое ребро на этом месте исчезло — скругление легло").toHaveLength(0);

  // Пересобранное скругление живёт в дереве одной операцией, а не двумя.
  const timeline = await cad.timeline();
  expect(timeline.filter((t) => t.kind === "fillet")).toHaveLength(1);
  expect(timeline.filter((t) => t.status !== "ok")).toEqual([]);

  await expect(page.getByText(/Fillet failed/)).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("невозможный радиус объясняется по-русски, а не как Fillet failed", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const cad = await CadEditor.open(page, "e2e-fillet-too-large");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(-SIDE / 2, -SIDE / 2, SIDE, SIDE);
  await cad.finishSketch();
  await cad.extrude({ distance: SIDE, direction: "symmetric" });

  const cube = await cad.topology();
  // Грани куба всего SIDE в ширину — скругление шире половины грани не встанет.
  await cad.filletExpectingError([cube.edges[0].id], SIDE, /не строится|помещается примерно/);

  await expect(page.getByText(/Fillet failed/)).toHaveCount(0);
});
