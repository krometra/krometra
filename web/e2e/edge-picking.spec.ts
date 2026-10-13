import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

/**
 * Выбор ребра — самая утомительная часть моделирования (ROADMAP, Фаза D).
 * Спека держит два обещания попадания: ховер подсвечивает ровно то ребро,
 * которое возьмёт клик, и промах на несколько пикселей мимо линии всё ещё
 * считается попаданием.
 */

test.use({ viewport: { width: 1680, height: 1000 } });

const SIDE = 60;
const HEIGHT = 20;

async function boxInEdgeMode(page: Page, name: string) {
  const cad = await CadEditor.open(page, name);
  await cad.startSketchOnBasePlane();
  await cad.drawRect(-SIDE / 2, -SIDE / 2, SIDE, SIDE);
  await cad.finishSketch();
  await cad.extrude({ distance: HEIGHT, direction: "symmetric" });

  await cad.click("Скругление");
  await expect(page.getByTestId("fillet-panel").first()).toBeVisible();

  const topo = await cad.topology();
  cad.useEdges(topo.edges);

  const edgeId = topo.edges[0].id;
  expect(await cad.aimAtEdge(edgeId, 60), "ракурс, разводящий ребро с соседями").not.toBeNull();

  return { cad, edgeId };
}

test("ховер подсвечивает то ребро, которое возьмёт клик", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const { cad, edgeId } = await boxInEdgeMode(page, "e2e-edge-pick-hover");

  const spot = await cad.pointOnEdge(edgeId);
  expect(spot, "точка на ребре при текущем ракурсе").not.toBeNull();

  await page.mouse.move(spot!.scr[0], spot!.scr[1]);
  await page.waitForTimeout(300);
  expect(await cad.hoveredEdge(), "ховер нашёл ребро под курсором").toBe(edgeId);

  await page.mouse.click(spot!.scr[0], spot!.scr[1]);
  await page.waitForTimeout(300);
  expect(await cad.selectedEdges(), "клик выбрал именно подсвеченное ребро").toEqual([edgeId]);
});

test("промах на 11 px мимо линии ребра всё ещё попадает", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const { cad, edgeId } = await boxInEdgeMode(page, "e2e-edge-pick-tolerance");

  const off = await cad.pointBesideEdge(edgeId, 11);
  expect(off, "точка в стороне от ребра").not.toBeNull();
  expect(off!.clearance, "рядом нет конкурирующего ребра").toBeGreaterThan(25);

  await page.mouse.move(off!.scr[0], off!.scr[1]);
  await page.waitForTimeout(300);
  expect(await cad.hoveredEdge(), "ховер держит ребро при промахе на 11 px").toBe(edgeId);

  await page.mouse.click(off!.scr[0], off!.scr[1]);
  await page.waitForTimeout(300);
  expect(await cad.selectedEdges(), "ребро выбрано кликом мимо линии").toEqual([edgeId]);
});
