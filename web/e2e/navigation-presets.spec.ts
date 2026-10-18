import { expect, test, type Page } from "@playwright/test";
import { CadEditor, expectEditorOpen } from "./helpers/cad";
import { rect, type Feature } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const ISO_CAMERA = [70, -70, 60];
const SETTLE_MS = 900;

type Camera = { position: number[]; target: number[]; up: number[] };
type Button = "left" | "middle" | "right";
type Modifier = "Shift" | "Control";

interface Navigation {
  preset: string;
  trackpadPan: boolean;
}

function sub(a: number[], b: number[]) {
  return a.map((value, axis) => value - b[axis]);
}

function length(vector: number[]) {
  return Math.hypot(...vector);
}

function distance(camera: Camera) {
  return length(sub(camera.position, camera.target));
}

function angleDeg(a: Camera, b: Camera) {
  const u = sub(a.position, a.target);
  const v = sub(b.position, b.target);
  const cos = u.reduce((sum, value, axis) => sum + value * v[axis], 0) / (length(u) * length(v));
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

function targetShift(a: Camera, b: Camera) {
  return length(sub(a.target, b.target));
}

function expectRotated(before: Camera, after: Camera, message: string) {
  expect(angleDeg(before, after), `${message}: направление взгляда повернулось`).toBeGreaterThan(5);
  expect(distance(after) / distance(before), `${message}: дистанция до цели та же`).toBeCloseTo(1, 1);
}

function expectPanned(before: Camera, after: Camera, message: string) {
  expect(targetShift(before, after), `${message}: цель сместилась`).toBeGreaterThan(1);
  expect(angleDeg(before, after), `${message}: направление взгляда то же`).toBeLessThan(1);
}

function expectUntouched(before: Camera, after: Camera, message: string) {
  expect(length(sub(before.position, after.position)), `${message}: камера на месте`).toBeLessThan(1e-3);
  expect(targetShift(before, after), `${message}: цель на месте`).toBeLessThan(1e-3);
}

async function emptySpot(page: Page): Promise<[number, number]> {
  const box = await page.locator("canvas").first().boundingBox();
  if (!box) throw new Error("канвас вьюпорта не найден");
  return [box.x + box.width * 0.22, box.y + box.height * 0.78];
}

async function drag(cad: CadEditor, button: Button, modifiers: Modifier[] = [], from?: [number, number]) {
  const [x, y] = from ?? (await emptySpot(cad.page));
  for (const key of modifiers) await cad.page.keyboard.down(key);
  await cad.page.mouse.move(x, y);
  await cad.page.mouse.down({ button });
  for (let i = 1; i <= 8; i++) await cad.page.mouse.move(x + i * 15, y - i * 5);
  await cad.page.mouse.up({ button });
  for (const key of modifiers) await cad.page.keyboard.up(key);
  await cad.page.waitForTimeout(SETTLE_MS);
}

async function measure(cad: CadEditor, move: () => Promise<void>): Promise<{ before: Camera; after: Camera }> {
  await cad.camera(ISO_CAMERA);
  const before = await cad.cameraState();
  await move();
  const after = await cad.cameraState();
  expect([...after.position, ...after.target].every(Number.isFinite), "камера без NaN").toBe(true);
  return { before, after };
}

async function wheel(cad: CadEditor, dx: number, dy: number, modifiers: Modifier[] = [], at?: [number, number]) {
  const box = await cad.page.locator("canvas").first().boundingBox();
  if (!box) throw new Error("канвас вьюпорта не найден");
  const [x, y] = at ?? [box.x + box.width / 2, box.y + box.height / 2];
  await cad.page.mouse.move(x, y);
  for (const key of modifiers) await cad.page.keyboard.down(key);
  await cad.page.mouse.wheel(dx, dy);
  for (const key of modifiers) await cad.page.keyboard.up(key);
  await cad.page.waitForTimeout(SETTLE_MS);
}

async function setNavigation(cad: CadEditor, params: Partial<Navigation>) {
  return cad.control<Navigation>("viewport.navigation", params);
}

test("пресеты навигации: кнопки мыши, зум к курсору, жесты трекпада и выбор в меню", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-navigation-presets");
  const sketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(-20, -20, 20, 20)] });
  await cad.control<Feature>("extrude", { sketchId: sketch.sketchId, distance: 20 });

  expect(await setNavigation(cad, {}), "по умолчанию - привычная раскладка Крометры").toEqual({ preset: "krometra", trackpadPan: false });

  let move = await measure(cad, () => drag(cad, "left"));
  expectRotated(move.before, move.after, "Крометра, ЛКМ");
  move = await measure(cad, () => drag(cad, "right"));
  expectPanned(move.before, move.after, "Крометра, ПКМ");

  const box = (await page.locator("canvas").first().boundingBox())!;
  move = await measure(cad, () => wheel(cad, 0, -240, [], [box.x + box.width * 0.85, box.y + box.height * 0.3]));
  expect(distance(move.after), "колесо от себя приближает").toBeLessThan(distance(move.before));
  expect(targetShift(move.before, move.after), "зум к курсору уводит цель к точке под курсором").toBeGreaterThan(0.5);

  await page.getByTestId("navigation-menu").click();
  await expect(page.getByTestId("navigation-panel")).toBeVisible();
  await page.getByTestId("navigation-preset-solidworks").click();
  await expect(page.getByTestId("navigation-hints")).toContainText("Ctrl+СКМ - панорама");
  expect((await setNavigation(cad, {})).preset).toBe("solidworks");

  move = await measure(cad, () => drag(cad, "middle"));
  expectRotated(move.before, move.after, "SolidWorks, СКМ");
  move = await measure(cad, () => drag(cad, "middle", ["Control"]));
  expectPanned(move.before, move.after, "SolidWorks, Ctrl+СКМ");
  move = await measure(cad, () => drag(cad, "left"));
  expectUntouched(move.before, move.after, "SolidWorks, ЛКМ только выбирает");

  await page.reload();
  await expectEditorOpen(page);
  await cad.install();
  expect((await setNavigation(cad, {})).preset, "выбор пресета переживает перезагрузку").toBe("solidworks");

  await setNavigation(cad, { preset: "fusion" });
  move = await measure(cad, () => drag(cad, "middle"));
  expectPanned(move.before, move.after, "Fusion 360, СКМ");
  move = await measure(cad, () => drag(cad, "middle", ["Shift"]));
  expectRotated(move.before, move.after, "Fusion 360, Shift+СКМ");

  await setNavigation(cad, { preset: "kompas" });
  move = await measure(cad, () => drag(cad, "middle", ["Shift"]));
  expectPanned(move.before, move.after, "КОМПАС-3D, Shift+СКМ");

  await setNavigation(cad, { preset: "onshape" });
  move = await measure(cad, () => drag(cad, "right"));
  expectRotated(move.before, move.after, "Onshape, ПКМ");
  await expect(page.getByRole("menuitem", { name: "Вид по нормали" }), "протяжка ПКМ не открывает меню").toHaveCount(0);
  await cad.camera(ISO_CAMERA);
  await page.mouse.click(...(await cad.projectPoint([0, -20, 10])), { button: "right" });
  await expect(page.getByRole("menuitem", { name: "Вид по нормали" }), "клик ПКМ без протяжки открывает меню грани").toBeVisible();
  await page.keyboard.press("Escape");

  await setNavigation(cad, { preset: "krometra" });
  move = await measure(cad, () => wheel(cad, 30, 20));
  expect(Math.abs(distance(move.after) - distance(move.before)), "по умолчанию двухпальцевый скролл зумит, как колесо").toBeGreaterThan(0.5);

  await page.getByTestId("navigation-menu").click();
  await page.getByTestId("navigation-trackpad-pan").click();
  expect((await setNavigation(cad, {})).trackpadPan, "чекбокс включает панораму двумя пальцами").toBe(true);
  move = await measure(cad, () => wheel(cad, 30, 20));
  expectPanned(move.before, move.after, "трекпад, два пальца");
  move = await measure(cad, () => wheel(cad, 0, -40, ["Control"]));
  expect(distance(move.after), "щипок трекпада (wheel с ctrlKey) приближает").toBeLessThan(distance(move.before));
  move = await measure(cad, () => wheel(cad, 40, 10, ["Shift"]));
  expectRotated(move.before, move.after, "трекпад, Shift + два пальца");

  await setNavigation(cad, { trackpadPan: false });

  const cube = page.getByTestId("view-cube");
  const cubeBox = (await cube.boundingBox())!;
  const cubeCenter: [number, number] = [cubeBox.x + cubeBox.width / 2, cubeBox.y + cubeBox.height / 2];
  move = await measure(cad, () => drag(cad, "left", [], cubeCenter));
  expectRotated(move.before, move.after, "перетаскивание ViewCube");

  await cad.camera(ISO_CAMERA);
  await page.locator("[data-face='top']").click({ force: true });
  await page.waitForTimeout(SETTLE_MS);
  const top = await cad.cameraState();
  const direction = sub(top.position, top.target).map((value) => value / distance(top));
  expect(direction[2], "клик по грани куба по-прежнему ставит вид сверху").toBeCloseTo(1, 2);

  expect(pageErrors).toEqual([]);
});
