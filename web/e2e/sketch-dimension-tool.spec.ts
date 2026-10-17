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

interface SketchSnapshot {
  entities: { id: string; type: string; start?: Point; end?: Point }[];
  constraints: { id: string; type: string; anchors: { entity_id: string; sub_index: number }[]; value: number | null }[];
  canUndo: boolean;
}

const sketchUi = (page: Page) => page.locator("[data-sketch-ui]");
const dimensionInput = (page: Page) => page.getByTestId("dimension-input");

async function sketchState(cad: CadEditor): Promise<SketchSnapshot> {
  return cad.control<SketchSnapshot>("sketch.get");
}

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
  await cad.page.waitForTimeout(560);
}

function verticalSides(state: SketchSnapshot) {
  return state.entities
    .filter((e) => e.type === "line" && Math.abs(e.start!.x - e.end!.x) < 1e-6)
    .sort((a, b) => a.start!.x - b.start!.x);
}

const midpoint = (e: SketchSnapshot["entities"][number]): [number, number] => [(e.start!.x + e.end!.x) / 2, (e.start!.y + e.end!.y) / 2];
const offMidpoint = (e: SketchSnapshot["entities"][number]): [number, number] => [e.start!.x + (e.end!.x - e.start!.x) * 0.3, e.start!.y + (e.end!.y - e.start!.y) * 0.3];

async function gapBetween(cad: CadEditor, leftId: string, rightId: string): Promise<number> {
  const state = await sketchState(cad);
  const left = state.entities.find((e) => e.id === leftId)!;
  const right = state.entities.find((e) => e.id === rightId)!;
  return right.start!.x - left.start!.x;
}

async function drawTwoRectangles(cad: CadEditor) {
  await cad.drawRect(-45, -10, 30, 20);
  await cad.drawRect(0, -5, 25, 30);
  const sides = verticalSides(await sketchState(cad));
  expect(sides, "у двух прямоугольников четыре вертикальные стороны").toHaveLength(4);
  return { aRight: sides[1], bLeft: sides[2] };
}

test("Размер (D): расстояние между сторонами двух прямоугольников, правка двойным кликом и отмена", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-sketch-dimension-tool");
  await cad.startSketchOnBasePlane();
  await zoomTo(cad, 4);
  const { aRight, bLeft } = await drawTwoRectangles(cad);
  expect(await gapBetween(cad, aRight.id, bLeft.id)).toBeCloseTo(15, 1);

  await page.keyboard.press("d");
  await expect(sketchUi(page).getByText("Размер: выберите отрезок, окружность, дугу или точку")).toBeVisible();

  await clickAt(cad, offMidpoint(aRight));
  await expect(sketchUi(page).getByText(/^Длина 20/)).toBeVisible();
  await clickAt(cad, offMidpoint(bLeft));

  await expect(dimensionInput(page)).toBeVisible();
  await expect(dimensionInput(page).getByText("Расстояние между отрезками")).toBeVisible();
  const field = dimensionInput(page).locator("input");
  expect(Number(await field.inputValue()), "в поле — текущее расстояние").toBeCloseTo(15, 0);
  await field.fill("20");
  await field.press("Enter");
  await expect(dimensionInput(page)).toBeHidden();

  await expect
    .poll(async () => (await sketchState(cad)).constraints.filter((c) => c.type === "line_distance").map((c) => c.value))
    .toEqual([20]);
  await expect.poll(() => gapBetween(cad, aRight.id, bLeft.id), { message: "решатель раздвинул стороны на 20" }).toBeCloseTo(20, 1);

  const placed = await sketchState(cad);
  const right = placed.entities.find((e) => e.id === aRight.id)!;
  const left = placed.entities.find((e) => e.id === bLeft.id)!;
  const [labelX, labelY] = [(right.start!.x + left.start!.x) / 2, midpoint(right)[1]];
  const [sx, sy] = await cad.sketchPoint([labelX, labelY]);
  await page.mouse.move(sx, sy);
  await page.waitForTimeout(130);
  await page.mouse.dblclick(sx, sy);

  await expect(dimensionInput(page)).toBeVisible();
  await expect(field).toHaveValue("20");
  await field.fill("30");
  await field.press("Enter");

  await expect.poll(() => gapBetween(cad, aRight.id, bLeft.id), { message: "правка размера пересчитала эскиз" }).toBeCloseTo(30, 1);
  expect((await sketchState(cad)).constraints.find((c) => c.type === "line_distance")?.value).toBe(30);

  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await sketchState(cad)).constraints.find((c) => c.type === "line_distance")?.value, { message: "одна отмена вернула 20" })
    .toBe(20);
  await expect.poll(() => gapBetween(cad, aRight.id, bLeft.id)).toBeCloseTo(20, 1);

  expect(pageErrors).toEqual([]);
});

test("Размер (D): Esc отменяет выбор и поле ввода, окружность сразу даёт диаметр", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-sketch-dimension-esc");
  await cad.startSketchOnBasePlane();
  await zoomTo(cad, 4);
  await cad.drawCircle(30, 10, 8);

  await page.keyboard.press("d");
  await clickAt(cad, [38, 10]);
  await expect(dimensionInput(page).getByText("Диаметр")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dimensionInput(page)).toBeHidden();
  expect((await sketchState(cad)).constraints.filter((c) => c.type === "diameter")).toHaveLength(0);

  await clickAt(cad, [38, 10]);
  const field = dimensionInput(page).locator("input");
  await field.fill("1 in");
  await field.press("Enter");
  await expect
    .poll(async () => (await sketchState(cad)).entities.find((e) => e.type === "circle") as unknown as { radius: number })
    .toMatchObject({ radius: expect.closeTo(12.7, 1) });

  expect(pageErrors).toEqual([]);
});

test("канал управления: расстояние между двумя отрезками = 20 и правка значения", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const cad = await CadEditor.open(page, "e2e-sketch-dimension-control");
  await cad.startSketchOnBasePlane();
  await cad.addSketchEntities([
    { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 30 } },
    { id: "l2", type: "line", start: { x: 12, y: 0 }, end: { x: 12, y: 30 } },
  ]);

  const added = await cad.control<{ constraintId: string; residual: number }>("sketch.addConstraint", {
    type: "line_distance",
    anchors: [{ entityId: "l1" }, { entityId: "l2" }],
    value: 20,
  });
  expect(added.residual).toBeLessThan(0.01);
  await expect.poll(() => gapBetween(cad, "l1", "l2")).toBeCloseTo(20, 1);

  await cad.control("sketch.setConstraintValue", { constraintId: added.constraintId, value: 35 });
  await expect.poll(() => gapBetween(cad, "l1", "l2")).toBeCloseTo(35, 1);

  await cad.control("history.undo");
  await expect.poll(() => gapBetween(cad, "l1", "l2")).toBeCloseTo(20, 1);
});
