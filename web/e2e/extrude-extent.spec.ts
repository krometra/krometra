import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

async function openExtrudePanel(cad: CadEditor) {
  await cad.click("Выдавить");
  await expect(cad.page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toBeVisible();
}

async function applyExtrude(page: Page) {
  await page.getByTestId("extrude-apply").dispatchEvent("click");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toHaveCount(0, { timeout: 60_000 });
}

async function chooseOption(page: Page, selector: string, value: string) {
  await page.locator(selector).evaluate((element: HTMLSelectElement, nextValue) => {
    element.value = nextValue;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test("выдавливание в обе стороны сохраняет два независимых расстояния", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const cad = await CadEditor.open(page, "e2e-extrude-two-sided");
  await cad.startSketchOnBasePlane();
  await cad.drawRect(-10, -10, 20, 20);
  await cad.finishSketch();

  await openExtrudePanel(cad);
  await page.locator('[inputmode="decimal"]').fill("20");
  await chooseOption(page, 'select:has(option[value="two_sided"])', "two_sided");
  await page.getByTestId("extrude-back-distance").fill("7");
  await applyExtrude(page);

  await expect.poll(async () => (await cad.timeline()).at(-1)?.params.direction).toBe("two_sided");
  expect((await cad.timeline()).at(-1)?.params).toMatchObject({
    distance: 20,
    back_distance: 7,
    extent_type: "distance",
    engine: "browser_wasm",
  });
  expect(await cad.visibleBodyCount()).toBe(1);
  const shape = await cad.topology();
  expect(shape.bbox.min[2]).toBeCloseTo(-7, 3);
  expect(shape.bbox.max[2]).toBeCloseTo(20, 3);
  expect(shape.openEdges).toBe(0);
});

test("выдавливание до выбранной грани использует её геометрию", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const cad = await CadEditor.open(page, "e2e-extrude-up-to-face");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(20, 20, 40, 40);
  await cad.finishSketch();
  await cad.extrude({ distance: 10 });
  const target = await cad.topology();
  expect(target.bbox.max[2]).toBeCloseTo(10, 3);

  await cad.startSketchOnBasePlane();
  await cad.drawRect(28, 28, 10, 10);
  await cad.finishSketch();
  await openExtrudePanel(cad);
  await chooseOption(page, '[data-testid="extrude-extent"]', "up_to_face");
  await expect(page.getByTestId("extrude-up-to-face")).toHaveText("Кликните грань во вьюпорте");

  await cad.camera([100, 100, 120], [40, 40, 0]);
  const [x, y] = await cad.projectPoint([50, 50, 10]);
  await page.mouse.click(x, y);
  await expect(page.getByTestId("extrude-up-to-face")).toContainText(/грань f-/);
  await applyExtrude(page);

  await expect.poll(async () => (await cad.timeline()).at(-1)?.params.extent_type).toBe("up_to_face");
  const params = (await cad.timeline()).at(-1)?.params;
  expect(params).toMatchObject({
    direction: "one_side",
    up_to_body_id: target.bodyId,
    engine: "browser_wasm",
  });
  expect(params.up_to_face_id).toMatch(/^f-/);
  const shape = await cad.topology();
  expect(shape.bbox.min[2]).toBeCloseTo(0, 3);
  expect(shape.bbox.max[2]).toBeCloseTo(10, 3);
  expect(shape.openEdges).toBe(0);
});
