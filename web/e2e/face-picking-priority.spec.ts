import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

/**
 * Приоритет граней тела над хелперами базовых плоскостей.
 *
 * Хелперы — квадраты max(габарит)×1.4: они накрывают деталь целиком, а XZ/YZ ещё
 * и проходят сквозь неё. Сравнение расстояний «в лоб» отдавало хелперу клик по
 * грани тела, и эскиз молча создавался без привязки к телу — с плоскостью XZ
 * вместо выбранной грани.
 */

// Свой логин: переиспользование refresh-cookie из storageState параллельно
// с другими спеками ловит replay-защиту.
test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const PLATE = 50;
const THICK = 20;

test("грань тела выигрывает у хелпера базовой плоскости", async ({ page }) => {
  test.setTimeout(5 * 60_000);

  const cad = await CadEditor.open(page, "e2e-face-picking-priority");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(-PLATE / 2, -PLATE / 2, PLATE, PLATE);
  await cad.finishSketch();
  await cad.extrude({ distance: THICK, direction: "symmetric" });

  // Точка на боковой грани x=+25 ниже плоскости XY: хелпер XZ проходит сквозь
  // тело и раньше перехватывал этот клик.
  await cad.startSketchOnFace([120, 40, 40], [[PLATE / 2, 0, -THICK / 4]]);

  const label = page.getByTestId("sketch-plane-label");
  await expect(label).toContainText("Грань #");
  await expect(label).toContainText("Тело");
  await expect(label).not.toContainText("Базовая плоскость");
  // Панель называет и опорную ориентацию, а не только «XZ» без контекста.
  await expect(page.getByText(/в плоскости (XY|XZ|YZ)/)).toBeVisible();
});
