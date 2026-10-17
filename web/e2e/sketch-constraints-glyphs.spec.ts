import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

interface Point {
  x: number;
  y: number;
}

interface Entity {
  id: string;
  type: string;
  start?: Point;
  end?: Point;
  center?: Point;
  radius?: number;
}

interface Constraint {
  id: string;
  type: string;
  anchors: { entity_id: string; sub_index: number }[];
  value: number | null;
}

interface SketchSnapshot {
  entities: Entity[];
  constraints: Constraint[];
}

interface Glyph {
  constraintId: string;
  type: string;
  x: number;
  y: number;
}

const sketchUi = (page: Page) => page.locator("[data-sketch-ui]");
const sketchButton = (page: Page, name: string) => sketchUi(page).getByRole("button", { name, exact: true });
const constraintRow = (page: Page, id: string) => page.locator(`[data-testid="sketch-constraint-row"][data-constraint-id="${id}"]`);
const selectedBar = (page: Page) => page.getByTestId("selected-constraint-bar");

const sketchState = (cad: CadEditor) => cad.control<SketchSnapshot>("sketch.get");
const glyphs = (cad: CadEditor) => cad.control<Glyph[]>("sketch.constraintGlyphs");
const byId = (state: SketchSnapshot, id: string) => state.entities.find((e) => e.id === id)!;
const ofType = (state: SketchSnapshot, type: string) => state.constraints.filter((c) => c.type === type);

async function zoomTo(cad: CadEditor, pixelsPerMm: number) {
  for (let i = 0; i < 14; i++) {
    const { pixelsPerMm: current } = await cad.control<{ pixelsPerMm: number }>("sketch.project", { points: [] });
    if (current >= pixelsPerMm) return;
    const [cx, cy] = await cad.sketchCanvasCenter();
    await cad.page.mouse.move(cx, cy);
    await cad.page.mouse.wheel(0, -240);
    await cad.page.waitForTimeout(160);
  }
}

async function clickAt(cad: CadEditor, point: [number, number]) {
  const [sx, sy] = await cad.sketchPoint(point);
  await cad.page.mouse.move(sx, sy);
  await cad.page.waitForTimeout(130);
  await cad.page.mouse.click(sx, sy);
  await cad.page.waitForTimeout(400);
}

async function glyphOf(cad: CadEditor, type: string): Promise<Glyph> {
  const found = (await glyphs(cad)).find((g) => g.type === type);
  expect(found, `значок ${type} на холсте`).toBeTruthy();
  return found!;
}

function distanceToLine(p: Point, line: Entity): number {
  const dx = line.end!.x - line.start!.x;
  const dy = line.end!.y - line.start!.y;
  return Math.abs((p.x - line.start!.x) * dy - (p.y - line.start!.y) * dx) / Math.hypot(dx, dy);
}

const lineMid = (line: Entity): [number, number] => [(line.start!.x + line.end!.x) / 2, (line.start!.y + line.end!.y) / 2];

test("новые ограничения с панели и значки: ховер, выбор, Delete и Ctrl+Z", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-sketch-constraint-glyphs");
  await cad.startSketchOnBasePlane();
  await cad.addSketchEntities([
    { id: "a", type: "line", start: { x: -40, y: 0 }, end: { x: -10, y: 0 } },
    { id: "b", type: "line", start: { x: 5, y: 6 }, end: { x: 35, y: 9 } },
    { id: "c", type: "circle", center: { x: -20, y: 25 }, radius: 6 },
  ]);
  await zoomTo(cad, 4);
  await sketchButton(page, "Выбор").click();

  await clickAt(cad, lineMid(byId(await sketchState(cad), "a")));
  await expect(sketchButton(page, "Сер")).toBeDisabled();
  await expect(sketchButton(page, "Сер")).toHaveAttribute("title", /недоступно: только для точки и отрезка, выбрано 1/);
  await expect(sketchButton(page, "Фикс")).toBeEnabled();

  await clickAt(cad, lineMid(byId(await sketchState(cad), "b")));
  await expect(page.getByText("Выбрано: 2")).toBeVisible();
  await sketchButton(page, "Колл").click();
  await expect.poll(async () => ofType(await sketchState(cad), "collinear")).toHaveLength(1);
  await expect
    .poll(async () => {
      const state = await sketchState(cad);
      const a = byId(state, "a");
      const b = byId(state, "b");
      return Math.max(distanceToLine(b.start!, a), distanceToLine(b.end!, a));
    }, { message: "второй отрезок встал на прямую первого" })
    .toBeLessThan(0.01);

  const placed = await sketchState(cad);
  const circle = byId(placed, "c");
  await clickAt(cad, [circle.center!.x + circle.radius!, circle.center!.y]);
  await clickAt(cad, lineMid(byId(placed, "a")));
  await sketchButton(page, "Сер").click();
  await expect
    .poll(async () => {
      const state = await sketchState(cad);
      const [mx, my] = lineMid(byId(state, "a"));
      const center = byId(state, "c").center!;
      return Math.hypot(center.x - mx, center.y - my);
    }, { message: "центр окружности в середине отрезка" })
    .toBeLessThan(0.01);
  expect(byId(await sketchState(cad), "c").radius).toBeCloseTo(6, 3);

  const collinear = await glyphOf(cad, "collinear");
  await page.mouse.move(collinear.x, collinear.y);
  await expect(constraintRow(page, collinear.constraintId)).toHaveAttribute("data-hovered", "true");

  await page.mouse.click(collinear.x, collinear.y);
  await expect(selectedBar(page)).toContainText("Коллин.");
  await expect(constraintRow(page, collinear.constraintId)).toHaveAttribute("data-selected", "true");

  const before = (await sketchState(cad)).constraints.length;
  await page.keyboard.press("Delete");
  await expect.poll(async () => ofType(await sketchState(cad), "collinear")).toHaveLength(0);
  expect((await sketchState(cad)).constraints).toHaveLength(before - 1);
  expect((await sketchState(cad)).entities).toHaveLength(3);
  await expect(selectedBar(page)).toBeHidden();

  await page.keyboard.press("Control+z");
  await expect.poll(async () => ofType(await sketchState(cad), "collinear"), { message: "одна отмена вернула ограничение" }).toHaveLength(1);
  expect((await sketchState(cad)).constraints).toHaveLength(before);

  const midpoint = await glyphOf(cad, "midpoint");
  await page.mouse.click(midpoint.x, midpoint.y);
  await expect(selectedBar(page)).toContainText("Середина");
  await page.getByTestId("delete-constraint").click();
  await expect.poll(async () => ofType(await sketchState(cad), "midpoint")).toHaveLength(0);

  await constraintRow(page, collinear.constraintId).click();
  await expect(selectedBar(page)).toContainText("Коллин.");
  await page.keyboard.press("Escape");
  await expect(selectedBar(page)).toBeHidden();

  await clickAt(cad, lineMid(byId(await sketchState(cad), "a")));
  await sketchButton(page, "Фикс").click();
  await expect
    .poll(async () => ofType(await sketchState(cad), "fix").map((c) => c.anchors))
    .toEqual([[{ entity_id: "a", sub_index: -1 }]]);

  expect(pageErrors).toEqual([]);
});

test("канал управления: точка на кривой, середина у начала координат, фиксация и удаление ограничения", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const cad = await CadEditor.open(page, "e2e-sketch-constraint-control");
  await cad.startSketchOnBasePlane();
  await cad.addSketchEntities([
    { id: "base", type: "line", start: { x: 4, y: 3 }, end: { x: 34, y: 3 } },
    { id: "ring", type: "circle", center: { x: 60, y: 0 }, radius: 10 },
    { id: "spoke", type: "line", start: { x: 80, y: 20 }, end: { x: 90, y: 30 } },
  ]);

  const fixed = await cad.control<{ constraintId: string }>("sketch.addConstraint", { type: "fix", anchors: [{ entityId: "ring" }] });
  const centered = await cad.control<{ residual: number }>("sketch.addConstraint", {
    type: "midpoint",
    anchors: [{ entityId: "origin" }, { entityId: "base" }],
  });
  expect(centered.residual).toBeLessThan(0.01);
  const onRing = await cad.control<{ constraintId: string; residual: number }>("sketch.addConstraint", {
    type: "point_on_curve",
    anchors: [{ entityId: "spoke", point: 0 }, { entityId: "ring" }],
  });
  expect(onRing.residual).toBeLessThan(0.01);

  const state = await sketchState(cad);
  const [mx, my] = lineMid(byId(state, "base"));
  expect(Math.hypot(mx, my), "середина отрезка в начале координат").toBeLessThan(0.01);
  expect(byId(state, "ring")).toMatchObject({ center: { x: 60, y: 0 }, radius: 10 });
  const spoke = byId(state, "spoke");
  expect(Math.hypot(spoke.start!.x - 60, spoke.start!.y)).toBeCloseTo(10, 2);
  expect(state.constraints.find((c) => c.id === fixed.constraintId)?.anchors).toEqual([{ entity_id: "ring", sub_index: -1 }]);

  expect((await glyphs(cad)).map((g) => g.type).sort()).toEqual(["fix", "midpoint", "point_on_curve"]);

  await cad.control("sketch.deleteConstraint", { constraintId: onRing.constraintId });
  expect(ofType(await sketchState(cad), "point_on_curve")).toHaveLength(0);
  await cad.control("history.undo");
  await expect.poll(async () => ofType(await sketchState(cad), "point_on_curve")).toHaveLength(1);
});
