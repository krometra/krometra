import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

test("поле расстояния понимает единицы и не принимает угол", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const cad = await CadEditor.open(page, "e2e-quantity-length");
  await cad.startSketchOnBasePlane();
  await cad.drawRect(-10, -10, 20, 20);
  await cad.finishSketch();

  await cad.click("Выдавить");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toBeVisible();
  const distance = page.getByTestId("extrude-distance");
  const apply = page.getByTestId("extrude-apply");

  await distance.fill("1 cm + 5 mm");
  await expect(apply).toHaveText("Выдавить 15 мм");

  await distance.fill("90deg");
  await expect(page.getByTestId("extrude-distance-error")).toHaveText("Это поле длины: нужны mm, cm, m, in, а не единицы угла");
  await expect(apply).toBeDisabled();

  await distance.fill("1in");
  await distance.press("Enter");
  await expect(distance).toHaveValue("25.4");
  await expect(page.getByTestId("extrude-distance-error")).toHaveCount(0);

  await apply.dispatchEvent("click");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(async () => (await cad.timeline()).at(-1)?.params.distance).toBeCloseTo(25.4, 6);
  const shape = await cad.topology();
  expect(shape.bbox.max[2]).toBeCloseTo(25.4, 3);
});

test("поле угла вращения понимает градусы и радианы и не принимает длину", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const cad = await CadEditor.open(page, "e2e-quantity-angle");
  await cad.startSketchOnBasePlane();
  await cad.drawRect(10, 0, 10, 10);
  await cad.finishSketch();

  await page.getByRole("button", { name: "Вращать", exact: true }).first().click();
  await expect(page.getByText("ПАРАМЕТРЫ ВРАЩЕНИЯ")).toBeVisible();
  const angle = page.getByTestId("revolve-angle");
  const apply = page.getByTestId("revolve-apply");

  await angle.fill("10 mm");
  await expect(page.getByTestId("revolve-angle-error")).toHaveText("Это поле угла: нужны deg, rad, а не единицы длины");
  await expect(apply).toBeDisabled();

  await angle.fill("1 rad");
  await angle.press("Enter");
  await expect(angle).toHaveValue("57.296");

  await angle.fill("400");
  await expect(page.getByTestId("revolve-angle-error")).toHaveText("Угол вращения должен быть больше 0 и не больше 360°");

  await angle.fill("90deg");
  await angle.press("Enter");
  await expect(angle).toHaveValue("90");
  await apply.dispatchEvent("click");
  await expect(page.getByText("ПАРАМЕТРЫ ВРАЩЕНИЯ")).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(async () => (await cad.timeline()).at(-1)?.params.angle).toBe(90);
});
