import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { circle, errorCode, rect, type Feature, type Topo } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const ISO_CAMERA = [70, -70, 60];
const ANIMATION_MS = 900;

interface SceneSection {
  section: { normal: number[]; constant: number } | null;
}

interface SelectionState {
  selection: { type: string; bodyId: string; faceId?: string } | null;
}

function unit(vector: number[]): number[] {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
}

function expectVector(actual: number[], expected: number[], message: string) {
  actual.forEach((value, axis) => expect(value, `${message} [${axis}]`).toBeCloseTo(expected[axis], 2));
}

async function viewDirection(cad: CadEditor): Promise<{ direction: number[]; up: number[] }> {
  const { position, target, up } = await cad.cameraState();
  expect([...position, ...target, ...up].every(Number.isFinite), "камера без NaN").toBe(true);
  return { direction: unit(position.map((value, axis) => value - target[axis])), up };
}

async function section(cad: CadEditor) {
  return (await cad.control<SceneSection>("scene.get")).section;
}

async function selectedFace(cad: CadEditor) {
  return (await cad.control<SelectionState>("selection.get")).selection;
}

async function press(page: Page, testId: string) {
  await page.getByTestId(testId).dispatchEvent("click");
  await page.waitForTimeout(300);
}

async function pickMenu(page: Page, label: string) {
  await page.getByRole("menuitem", { name: label }).dispatchEvent("click");
  await page.waitForTimeout(ANIMATION_MS);
}

test("сечение показывает внутренний канал, вид по нормали ставит камеру на грань", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-section-look-at");

  const blockSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(-20, -20, 20, 20)] });
  const block = await cad.control<Feature>("extrude", { sketchId: blockSketch.sketchId, distance: 20 });
  const channelSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XZ", entities: [circle(0, 10, 4)] });
  const channel = await cad.control<Feature>("extrude", {
    sketchId: channelSketch.sketchId,
    distance: 30,
    direction: "symmetric",
    operation: "cut",
    targetBodyId: block.feature.bodyId,
  });
  const bodyId = channel.feature.bodyId;
  const topo = await cad.control<Topo>("topology", { bodyId });
  const faceWithNormal = (normal: number[]) =>
    topo.faces.find((face) => face.planar && face.normal && face.normal.every((value, axis) => Math.abs(value - normal[axis]) < 1e-3));
  const top = faceWithNormal([0, 0, 1])!;
  const right = faceWithNormal([1, 0, 0])!;
  expect(top && right, "у блока есть верхняя и правая грани").toBeTruthy();

  await cad.camera(ISO_CAMERA);
  const insideCut: [number, number, number] = [5, 0, 5];
  await page.mouse.click(...(await cad.projectPoint(insideCut)));
  expect((await selectedFace(cad))?.faceId, "без сечения луч к точке среза ловит правую грань").toBe(right.id);

  await press(page, "view-section");
  await expect(page.getByTestId("section-panel")).toBeVisible();
  const xy = await section(cad);
  expectVector(xy!.normal, [0, 0, -1], "XY по умолчанию оставляет низ, срез смотрит на камеру сверху");
  expect(xy!.constant).toBeCloseTo(10, 3);

  await press(page, "section-plane-XZ");
  const xz = await section(cad);
  expectVector(xz!.normal, [0, 1, 0], "XZ: камера спереди, остаётся задняя половина");
  expect(xz!.constant).toBeCloseTo(0, 3);

  await page.mouse.click(...(await cad.projectPoint(insideCut)));
  expect(await selectedFace(cad), "клик в заливку среза не выбирает ни отсечённую грань, ни стенку за срезом").toBeNull();
  await page.mouse.click(...(await cad.projectPoint([10, 10, 20])));
  expect((await selectedFace(cad))?.faceId, "уцелевшая половина выбирается как обычно").toBe(top.id);

  await press(page, "section-flip");
  expectVector((await section(cad))!.normal, [0, -1, 0], "переворот оставляет переднюю половину");
  const offsetInput = page.getByTestId("section-offset").locator("input");
  await offsetInput.fill("5");
  await offsetInput.press("Enter");
  await page.waitForTimeout(300);
  expect((await section(cad))!.constant, "смещение из поля двигает плоскость").toBeCloseTo(5, 3);

  await press(page, "section-look-at");
  await page.waitForTimeout(ANIMATION_MS);
  const alongSection = await viewDirection(cad);
  expectVector(alongSection.direction, [0, 1, 0], "камера смотрит на срез со стороны отсечённой части");
  expectVector(alongSection.up, [0, 0, 1], "верх экрана остаётся мировым +Z");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("section-panel")).toBeHidden();
  expect(await section(cad), "Esc выключает сечение").toBeNull();
  expect((await cad.control<{ timeline: unknown[] }>("state")).timeline, "сечение не меняет документ").toHaveLength(4);

  await cad.camera(ISO_CAMERA);
  await page.mouse.click(...(await cad.projectPoint([10, 10, 20])));
  expect((await selectedFace(cad))?.faceId).toBe(top.id);
  await press(page, "view-look-at");
  await page.waitForTimeout(ANIMATION_MS);
  const fromTop = await viewDirection(cad);
  expectVector(fromTop.direction, [0, 0, 1], "вид по нормали к верхней грани — сверху");
  expectVector(fromTop.up, [0, 1, 0], "сверху верх экрана — +Y, как у ViewCube");

  await cad.camera(ISO_CAMERA);
  await page.mouse.click(...(await cad.projectPoint([0, -20, 15])), { button: "right" });
  await pickMenu(page, "Вид по нормали");
  const fromFront = await viewDirection(cad);
  expectVector(fromFront.direction, [0, -1, 0], "контекстное меню грани: вид спереди");
  expectVector(fromFront.up, [0, 0, 1], "спереди верх экрана — +Z");

  await page.mouse.click(...(await cad.projectPoint([0, -20, 15])), { button: "right" });
  await pickMenu(page, "Сечение по грани");
  expectVector((await section(cad))!.normal, [0, 1, 0], "сечение по передней грани режет её внутрь тела");
  await press(page, "view-section");
  expect(await section(cad), "кнопка выключает сечение").toBeNull();

  await page.getByText("Начало координат").click();
  await page.getByText("Плоскость YZ").click({ button: "right" });
  await pickMenu(page, "Вид по нормали");
  expectVector((await viewDirection(cad)).direction, [1, 0, 0], "вид по нормали к YZ — справа");

  const pose = await cad.control<{ position: number[]; target: number[]; up: number[] }>("camera.lookAt", { plane: "XY" });
  await page.waitForTimeout(ANIMATION_MS);
  expectVector(unit(pose.position.map((value, axis) => value - pose.target[axis])), [0, 0, 1], "канал: вид по нормали к XY");
  expectVector((await viewDirection(cad)).direction, [0, 0, 1], "камера долетела до ответа канала");
  const curved = topo.faces.find((face) => !face.planar)!;
  expect(await errorCode(cad, "camera.lookAt", { bodyId, faceId: curved.id }), "к стенке канала вида по нормали нет").toBe("operation_failed");

  expect(pageErrors).toEqual([]);
});
