import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

/**
 * Кнопки «Скругление» и «Фаска» ведут в одну панель, поэтому раньше обе
 * открывали её в режиме скругления, и фаску приходилось выбирать ещё раз
 * переключателем. Панель должна открываться в режиме нажатой кнопки.
 */

test.use({ viewport: { width: 1680, height: 1000 } });

const SIDE = 60;
const HEIGHT = 20;

test("кнопка палитры задаёт режим панели: фаска открывает фаску", async ({ page }) => {
  const cad = await CadEditor.open(page, "fillet-chamfer-mode");
  await cad.startSketchOnBasePlane();
  await cad.drawRect(-SIDE / 2, -SIDE / 2, SIDE, SIDE);
  await cad.finishSketch();
  await cad.extrude({ distance: HEIGHT, direction: "symmetric" });

  const panel = page.getByTestId("fillet-panel");

  await cad.click("Фаска");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Расстояние 1")).toBeVisible();
  await expect(panel.getByText("Радиус")).toHaveCount(0);

  await page.getByRole("button", { name: "Закрыть" }).dispatchEvent("click");
  await expect(panel).toHaveCount(0);

  await cad.click("Скругление");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Радиус")).toBeVisible();
  await expect(panel.getByText("Расстояние 1")).toHaveCount(0);
});
