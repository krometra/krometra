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
  point?: Point;
  angle?: number;
  construction?: boolean;
}

interface SketchSnapshot {
  entities: Entity[];
  constraints: { id: string; type: string; anchors: { entity_id: string; sub_index: number }[]; value: number | null }[];
}

interface SelectionItem {
  kind: string;
  entityId: string;
  point?: number;
}

const sketchUi = (page: Page) => page.locator("[data-sketch-ui]");
const sketchButton = (page: Page, name: string) => sketchUi(page).getByRole("button", { name, exact: true });
const dimensionInput = (page: Page) => page.getByTestId("dimension-input");

const sketchState = (cad: CadEditor) => cad.control<SketchSnapshot>("sketch.get");
const selection = async (cad: CadEditor) => (await cad.control<{ selection: SelectionItem[] }>("sketch.getSelection")).selection;
const entity = async (cad: CadEditor, id: string) => (await sketchState(cad)).entities.find((e) => e.id === id)!;
const mid = (e: Entity): [number, number] => [(e.start!.x + e.end!.x) / 2, (e.start!.y + e.end!.y) / 2];

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

function bottomSide(state: SketchSnapshot): Entity {
  return state.entities
    .filter((e) => e.type === "line" && Math.abs(e.start!.y - e.end!.y) < 1e-6)
    .sort((a, b) => a.start!.y - b.start!.y)[0];
}

test("Выбор: середина стороны совпадает с началом координат, точка встаёт на вертикаль через начало", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-sketch-point-selection");
  await cad.startSketchOnBasePlane();
  await zoomTo(cad, 4);
  await cad.drawRect(12, 10, 30, 20);
  const bottom = bottomSide(await sketchState(cad));

  await sketchButton(page, "Выбор").click();
  await clickAt(cad, mid(bottom));
  await clickAt(cad, [0, 0]);
  await expect(sketchUi(page).getByText("Выбрано: 2")).toBeVisible();
  expect(await selection(cad)).toMatchObject([
    { kind: "point", entityId: bottom.id, point: 2 },
    { kind: "origin" },
  ]);

  await sketchButton(page, "Совп").click();
  await expect
    .poll(async () => (await sketchState(cad)).constraints.filter((c) => c.type === "coincident" && c.anchors.some((a) => a.entity_id === "sketch-origin")).map((c) => c.anchors))
    .toEqual([[{ entity_id: bottom.id, sub_index: 2 }, { entity_id: "sketch-origin", sub_index: 0 }]]);
  await expect.poll(async () => Math.hypot(...mid(await entity(cad, bottom.id))), { message: "середина стороны в начале координат" }).toBeLessThan(0.1);
  const moved = await entity(cad, bottom.id);
  expect(Math.abs(moved.end!.x - moved.start!.x), "ширина прямоугольника сохранилась").toBeCloseTo(30, 1);

  await cad.addSketchEntities([{ id: "free", type: "line", start: { x: 20, y: 40 }, end: { x: 35, y: 48 } }]);
  await clickAt(cad, [35, 48]);
  await clickAt(cad, [0, 0]);
  const picked = await selection(cad);
  expect(picked).toHaveLength(2);
  expect(picked[0]).toMatchObject({ kind: "point", entityId: "free", point: 1 });

  await sketchButton(page, "Вер").click();
  await expect.poll(async () => (await entity(cad, "free")).end!.x, { message: "конец отрезка на вертикали через начало" }).toBeCloseTo(0, 1);
  expect((await sketchState(cad)).constraints.filter((c) => c.type === "vertical" && c.anchors.length === 2)).toHaveLength(1);

  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await sketchState(cad)).constraints.filter((c) => c.type === "vertical" && c.anchors.length === 2).length, { message: "одна отмена" })
    .toBe(0);
  expect(pageErrors).toEqual([]);
});

test("Вспомогательная геометрия: размер от ребра грани, ось как линия, Delete удаляет вспомогательную прямую", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-sketch-construction-selection");
  await cad.startSketchOnBasePlane();
  await cad.addSketchEntities([
    { id: "face-edge-e2e-1", type: "line", start: { x: -40, y: -20 }, end: { x: 40, y: -20 }, construction: true },
    { id: "side", type: "line", start: { x: -15, y: -5 }, end: { x: 15, y: -5 } },
  ]);
  await zoomTo(cad, 4);

  await page.keyboard.press("d");
  await clickAt(cad, [25, -20]);
  await clickAt(cad, [8, -5]);
  await expect(dimensionInput(page).getByText("Расстояние между отрезками")).toBeVisible();
  const field = dimensionInput(page).locator("input");
  expect(Number(await field.inputValue())).toBeCloseTo(15, 0);
  await field.fill("10");
  await field.press("Enter");
  await expect.poll(async () => (await entity(cad, "side")).start!.y, { message: "отрезок встал в 10 мм от ребра" }).toBeCloseTo(-10, 1);
  expect(await entity(cad, "face-edge-e2e-1"), "ребро грани не сдвинулось").toMatchObject({ start: { x: -40, y: -20 }, end: { x: 40, y: -20 } });

  await sketchButton(page, "Выбор").click();
  await clickAt(cad, [-30, 0]);
  await clickAt(cad, [8, -10]);
  expect(await selection(cad)).toMatchObject([{ kind: "axis", entityId: "sketch-axis-x" }, { kind: "entity", entityId: "side" }]);
  await expect(sketchButton(page, "∥")).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(sketchUi(page).getByText(/^Выбрано:/)).toBeHidden();

  await sketchButton(page, "Гориз.").click();
  await clickAt(cad, [0, 30]);
  const infline = (await sketchState(cad)).entities.find((e) => e.type === "infline");
  expect(infline, "вспомогательная прямая построена").toBeDefined();

  await sketchButton(page, "Выбор").click();
  await clickAt(cad, [35, infline!.point!.y]);
  expect(await selection(cad)).toMatchObject([{ kind: "entity", entityId: infline!.id }]);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await sketchState(cad)).entities.some((e) => e.type === "infline"), { message: "Delete удалил прямую" }).toBe(false);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await sketchState(cad)).entities.some((e) => e.type === "infline")).toBe(true);

  expect(pageErrors).toEqual([]);
});

test("канал управления: выбор точек и осей, ограничение и размер по выделению", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const cad = await CadEditor.open(page, "e2e-sketch-selection-control");
  await cad.startSketchOnBasePlane();
  await cad.addSketchEntities([
    { id: "a", type: "line", start: { x: 10, y: 10 }, end: { x: 40, y: 12 } },
    { id: "face-edge-e2e-2", type: "line", start: { x: -50, y: -30 }, end: { x: 50, y: -30 }, construction: true },
  ]);

  const selected = await cad.control<{ selection: SelectionItem[] }>("sketch.select", {
    items: [{ entityId: "a", point: 2 }, { entityId: "origin" }],
  });
  expect(selected.selection).toMatchObject([{ kind: "point", entityId: "a", point: 2 }, { kind: "origin" }]);

  const coincident = await cad.control<{ constraintIds: string[]; residual: number }>("sketch.constrainSelection", { type: "coincident" });
  expect(coincident.constraintIds).toHaveLength(1);
  expect(coincident.residual).toBeLessThan(0.01);
  await expect.poll(async () => Math.hypot(...mid(await entity(cad, "a"))), { message: "середина отрезка в начале координат" }).toBeLessThan(0.05);
  expect(await selection(cad), "после ограничения выделение снято").toEqual([]);

  await cad.control("sketch.select", { items: [{ entityId: "a" }, { entityId: "axis-x" }] });
  await cad.control("sketch.constrainSelection", { type: "parallel" });
  await expect.poll(async () => {
    const a = await entity(cad, "a");
    return Math.abs(a.end!.y - a.start!.y);
  }, { message: "отрезок параллелен оси X" }).toBeLessThan(0.1);

  await cad.control("sketch.select", { items: [{ entityId: "face-edge-e2e-2" }, { entityId: "a", point: 0 }] });
  const distance = await cad.control<{ constraintIds: string[]; residual: number }>("sketch.constrainSelection", { type: "distance", value: 30 });
  expect(distance.residual).toBeLessThan(0.05);
  const state = await sketchState(cad);
  expect(state.constraints.find((c) => c.id === distance.constraintIds[0])).toMatchObject({ type: "point_line_distance", value: 30 });
  expect(state.entities.find((e) => e.id === "face-edge-e2e-2")).toMatchObject({ start: { x: -50, y: -30 } });

  const rejected = await cad.request("sketch.constrainSelection", { type: "coincident" });
  expect(rejected.ok).toBe(false);
});
