import { expect, test, type Page } from "@playwright/test";
import { CadEditor, type Edge } from "./helpers/cad";

test.use({ viewport: { width: 1680, height: 1000 } });

const SIDE = 60;
const HEIGHT = 20;
const RADIUS = 8;
const TOP = HEIGHT / 2;

const isVertical = (edge: Edge) => Math.abs(edge.a[2] - edge.b[2]) > HEIGHT / 2;
const onTop = (edge: Edge) => [edge.a[2], edge.b[2]].every((z) => Math.abs(z - TOP) < 1e-3);
const span = (edge: Edge) => Math.hypot(edge.a[0] - edge.b[0], edge.a[1] - edge.b[1]);
const sorted = (ids: string[]) => [...ids].sort();

async function roundedBoxInEdgeMode(page: Page, name: string) {
  const cad = await CadEditor.open(page, name);
  await cad.startSketchOnBasePlane();
  await cad.drawRect(-SIDE / 2, -SIDE / 2, SIDE, SIDE);
  await cad.finishSketch();
  await cad.extrude({ distance: HEIGHT, direction: "symmetric" });

  const box = await cad.topology();
  await cad.fillet(box.edges.filter(isVertical).map((edge) => edge.id), RADIUS);

  await cad.click("Скругление");
  await expect(page.getByTestId("fillet-panel").first()).toBeVisible();

  const topo = await cad.topology();
  cad.useEdges(topo.edges);
  await cad.setEdgeChain(true);

  const topLoop = topo.edges.filter(onTop);
  expect(topLoop, "верхний контур: 4 отрезка и 4 дуги").toHaveLength(8);
  const straight = topLoop.find((edge) => span(edge) > SIDE - 2 * RADIUS - 1)!;
  return { cad, straight, loopIds: sorted(topLoop.map((edge) => edge.id)) };
}

test("клик по ребру берёт касательную цепочку, список снимает её так же, как клик", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const { cad, straight, loopIds } = await roundedBoxInEdgeMode(page, "e2e-edge-chain");
  const rows = page.getByTestId("edge-selection-row");

  expect(await cad.aimAtEdge(straight.id, 60), "ракурс, разводящий ребро с соседями").not.toBeNull();
  const spot = await cad.pointOnEdge(straight.id);
  expect(spot, "точка на ребре при текущем ракурсе").not.toBeNull();
  const [x, y] = spot!.scr;

  await page.mouse.move(x, y);
  await page.waitForTimeout(300);
  expect(await cad.hoveredEdge(), "ховер нашёл ребро под курсором").toBe(straight.id);
  expect(sorted(await cad.highlightedEdges()), "ховер подсветил всю цепочку").toEqual(loopIds);

  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
  expect(sorted(await cad.selectedEdges()), "клик взял ровно подсвеченную цепочку").toEqual(loopIds);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Цепочка: 8 рёбер");

  await rows.first().hover();
  expect(sorted(await cad.highlightedEdges()), "строка списка подсвечивает свои рёбра").toEqual(loopIds);

  await page.getByTestId("edge-selection-remove").first().click();
  expect(await cad.selectedEdges(), "крестик снял цепочку целиком").toEqual([]);
  await expect(rows).toHaveCount(0);

  await page.getByTestId("edge-chain-toggle").click();
  await page.mouse.move(x, y);
  await page.waitForTimeout(300);
  expect(await cad.highlightedEdges(), "без цепочки ховер держит одно ребро").toEqual([straight.id]);

  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
  expect(await cad.selectedEdges(), "без цепочки клик берёт одно ребро").toEqual([straight.id]);
  await expect(rows.first()).toContainText("Отрезок");

  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
  expect(await cad.selectedEdges(), "повторный клик снимает ребро").toEqual([]);
});

test("клик по грани мимо рёбер берёт все её рёбра, повторный — снимает", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const { cad, loopIds } = await roundedBoxInEdgeMode(page, "e2e-edge-face");

  await cad.camera([25, -35, 110]);
  const [x, y] = await cad.projectPoint([0, 0, TOP]);

  await page.mouse.move(x, y);
  await page.waitForTimeout(300);
  expect(await cad.hoveredEdge(), "под курсором нет ребра").toBeNull();
  expect(sorted(await cad.highlightedEdges()), "ховер над гранью подсветил её рёбра").toEqual(loopIds);

  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
  expect(sorted(await cad.selectedEdges()), "клик по грани взял весь её контур").toEqual(loopIds);
  await expect(page.getByTestId("fillet-panel").first()).toContainText("Выбрано 8 рёбер");

  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
  expect(await cad.selectedEdges(), "повторный клик по грани снял её рёбра").toEqual([]);
});

test("канал управления берёт ровно названное ребро, цепочка действует только на клики", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const { cad, straight, loopIds } = await roundedBoxInEdgeMode(page, "e2e-edge-channel");
  const bodyId = (await cad.visibleBodyIds()).at(-1)!;

  const state = await cad.control<{ edgeChain: boolean }>("selection.get");
  expect(state.edgeChain, "цепочка включена").toBe(true);
  expect(await cad.control("selection.setEdgeChain", { enabled: false })).toEqual({ edgeChain: false });
  expect(await cad.control("selection.setEdgeChain", { enabled: true })).toEqual({ edgeChain: true });

  const fillet = await cad.control<{ feature: { kind: string; params: { edge_ids: unknown } } }>("fillet", {
    bodyId,
    edgeIds: [straight.id],
    radius: 1,
  });
  expect(fillet.feature.kind).toBe("fillet");
  const sent = JSON.stringify(fillet.feature.params.edge_ids);
  expect(sent, "названное ребро ушло в операцию").toContain(straight.id);
  for (const edgeId of loopIds.filter((id) => id !== straight.id)) {
    expect(sent, "остальные рёбра цепочки в операцию не попали").not.toContain(edgeId);
  }
});
