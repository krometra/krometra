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
  construction?: boolean;
}

interface Constraint {
  id: string;
  type: string;
  anchors: { entity_id: string; sub_index: number }[];
}

interface SketchSnapshot {
  id: string;
  entities: Entity[];
  constraints: Constraint[];
}

const constructionToggle = (page: Page) => page.getByTestId("sketch-construction-toggle");
const autoHint = (page: Page) => page.locator("[data-auto-constraints]");

function sketchState(cad: CadEditor): Promise<SketchSnapshot> {
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

async function hover(cad: CadEditor, point: [number, number]) {
  const [sx, sy] = await cad.sketchPoint(point);
  await cad.page.mouse.move(sx, sy, { steps: 4 });
  await cad.page.waitForTimeout(150);
}

async function clickAt(cad: CadEditor, point: [number, number]) {
  await hover(cad, point);
  const [sx, sy] = await cad.sketchPoint(point);
  await cad.page.mouse.click(sx, sy);
  await cad.page.waitForTimeout(560);
}

async function newEntities(cad: CadEditor, before: SketchSnapshot): Promise<Entity[]> {
  const known = new Set(before.entities.map((e) => e.id));
  return (await sketchState(cad)).entities.filter((e) => !known.has(e.id));
}

async function setSnap(page: Page, enabled: boolean) {
  const snap = page.locator("[data-sketch-ui]").getByRole("button", { name: "Привязка", exact: true });
  if ((await snap.getAttribute("aria-pressed")) !== String(enabled)) await snap.click();
  await expect(snap).toHaveAttribute("aria-pressed", String(enabled));
}

test("Вспомогательная (X/Ч): отрезок, прямоугольник, окружность и дуги рисуются вспомогательными и не входят в профиль", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-sketch-construction");
  await cad.startSketchOnBasePlane();
  await zoomTo(cad, 4);
  await cad.drawRect(-20, -15, 40, 30);
  const regular = await sketchState(cad);
  expect(regular.entities.filter((e) => !e.construction)).toHaveLength(4);

  await page.keyboard.press("x");
  await expect(constructionToggle(page)).toHaveAttribute("aria-pressed", "true");

  await cad.drawRect(-10, -8, 20, 16);
  await cad.drawCircle(0, 0, 5);
  await cad.click("Линия");
  await clickAt(cad, [-17, 12]);
  await clickAt(cad, [17, -11]);
  await cad.click("Дуга");
  await clickAt(cad, [11, 5]);
  await clickAt(cad, [15, 5]);
  await clickAt(cad, [11, 9]);
  await cad.click("Дуга 3т");
  await clickAt(cad, [-15, -4]);
  await clickAt(cad, [-5, -4]);
  await clickAt(cad, [-10, -1]);

  await page.keyboard.press("ч");
  await expect(constructionToggle(page)).toHaveAttribute("aria-pressed", "false");

  const drawn = await newEntities(cad, regular);
  expect(drawn.map((e) => e.type).sort()).toEqual(["arc", "arc", "circle", "line", "line", "line", "line", "line"]);
  expect(drawn.every((e) => e.construction === true), "всё нарисованное в режиме - вспомогательное").toBe(true);

  await constructionToggle(page).click();
  await expect(constructionToggle(page)).toHaveAttribute("aria-pressed", "true");
  await constructionToggle(page).click();
  await expect(constructionToggle(page)).toHaveAttribute("aria-pressed", "false");

  const { id: sketchId } = await sketchState(cad);
  await cad.finishSketch();
  const extruded = await cad.control<{ feature: { bodyId: string } }>("extrude", { sketchId, distance: 10 });
  const measured = await cad.control<{ items: { volume: number }[] }>("measure", { targets: [{ bodyId: extruded.feature.bodyId }] });
  expect(measured.items[0].volume, "вспомогательные контуры не вырезали отверстий").toBeCloseTo(40 * 30 * 10, 0);

  expect(pageErrors).toEqual([]);
});

test("Сделать вспомогательной / обычной для выделенного: одним шагом истории, клавишей X и каналом", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const cad = await CadEditor.open(page, "e2e-sketch-construction-toggle");
  await cad.startSketchOnBasePlane();
  await zoomTo(cad, 4);
  await cad.addSketchEntities([
    { id: "ring", type: "circle", center: { x: 0, y: 0 }, radius: 10 },
    { id: "bar", type: "line", start: { x: -30, y: -20 }, end: { x: 30, y: -20 } },
  ]);
  const flag = async (id: string) => (await sketchState(cad)).entities.find((e) => e.id === id)?.construction ?? false;

  await cad.click("Выбор");
  await clickAt(cad, [10, 0]);
  const makeConstruction = page.getByTestId("sketch-toggle-construction-selected");
  await expect(makeConstruction).toHaveText("Сделать вспомогательной");
  await makeConstruction.click();
  await expect.poll(() => flag("ring")).toBe(true);
  await expect(makeConstruction).toHaveText("Сделать обычной");

  await page.keyboard.press("Control+z");
  await expect.poll(() => flag("ring"), { message: "одна отмена вернула обычную окружность" }).toBe(false);

  await page.keyboard.press("x");
  await expect.poll(() => flag("ring"), { message: "X с выделением переключает выбранное" }).toBe(true);
  await expect(constructionToggle(page), "режим инструмента не включился").toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");

  await clickAt(cad, [10, 0]);
  await expect(makeConstruction, "вспомогательная окружность выбирается кликом").toHaveText("Сделать обычной");
  await makeConstruction.click();
  await expect.poll(() => flag("ring")).toBe(false);
  await page.keyboard.press("Escape");

  const reply = await cad.control<{ construction: boolean }>("sketch.setConstruction", { entityIds: ["ring", "bar"] });
  expect(reply.construction).toBe(true);
  expect([await flag("ring"), await flag("bar")]).toEqual([true, true]);
  await cad.control("sketch.setConstruction", { entityIds: ["bar"], construction: false });
  expect(await flag("bar")).toBe(false);
  await cad.control("history.undo");
  await expect.poll(() => flag("bar"), { message: "отмена канала - тоже один шаг" }).toBe(true);
  expect(await flag("ring")).toBe(true);
});

test("Авто-ограничения: значок H до клика и horizontal после, перпендикуляр от конца отрезка, Shift отключает", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-sketch-autoconstraints");
  await cad.startSketchOnBasePlane();
  await zoomTo(cad, 4);
  await cad.addSketchEntities([{ id: "base", type: "line", start: { x: -30, y: -30 }, end: { x: -10, y: -20 } }]);

  await setSnap(page, false);
  await cad.click("Линия");
  let before = await sketchState(cad);
  await clickAt(cad, [-20, 10]);
  await hover(cad, [10, 11]);
  await expect(autoHint(page), "значок горизонтали виден до клика").toHaveAttribute("data-auto-constraints", "H");
  await clickAt(cad, [10, 11]);
  await expect(autoHint(page)).toHaveAttribute("data-auto-constraints", "");
  const [flat] = await newEntities(cad, before);
  expect(flat.end!.y, "конец прилип к горизонтали").toBeCloseTo(flat.start!.y, 6);
  expect((await sketchState(cad)).constraints.filter((c) => c.type === "horizontal" && c.anchors[0].entity_id === flat.id)).toHaveLength(1);

  before = await sketchState(cad);
  await clickAt(cad, [20, 20]);
  await page.keyboard.down("Shift");
  await hover(cad, [40, 21]);
  await expect(autoHint(page), "Shift гасит значок").toHaveAttribute("data-auto-constraints", "");
  const [sx, sy] = await cad.sketchPoint([40, 21]);
  await page.mouse.click(sx, sy);
  await page.waitForTimeout(560);
  await page.keyboard.up("Shift");
  const [free] = await newEntities(cad, before);
  expect(free.end!.y - free.start!.y, "с Shift линия не прилипла").toBeGreaterThan(0.5);
  expect((await sketchState(cad)).constraints.filter((c) => c.anchors.some((a) => a.entity_id === free.id))).toHaveLength(0);

  await setSnap(page, true);
  before = await sketchState(cad);
  await clickAt(cad, [-10, -20]);
  await hover(cad, [-15.6, -7.8]);
  await expect(autoHint(page), "перпендикуляр к отрезку, от конца которого рисуем").toHaveAttribute("data-auto-constraints", "⊥");
  await clickAt(cad, [-15.6, -7.8]);
  const [normal] = await newEntities(cad, before);
  const dot = (normal.end!.x - normal.start!.x) * 20 + (normal.end!.y - normal.start!.y) * 10;
  expect(Math.abs(dot), "новая линия перпендикулярна базовой").toBeLessThan(1e-3);
  const own = (await sketchState(cad)).constraints.filter((c) => c.anchors.some((a) => a.entity_id === normal.id));
  expect(own.map((c) => c.type).sort()).toEqual(["coincident", "perpendicular"]);
  expect(own.find((c) => c.type === "coincident")!.anchors).toEqual([
    { entity_id: normal.id, sub_index: 0 },
    { entity_id: "base", sub_index: 1 },
  ]);

  expect(pageErrors).toEqual([]);
});
