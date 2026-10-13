import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

/**
 * Сцена и ядро в одной системе координат (Z-up).
 *
 * Раньше вьюпорт был Y-up: «пол» на экране — плоскость XZ, поэтому клик по
 * визуально горизонтальному хелперу давал эскиз не в той плоскости, деталь
 * росла вбок, а в экспортированном STEP лежала на боку.
 */
test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const SIDE = 30;
const HEIGHT = 12;

test("эскиз на горизонтальной плоскости даёт XY, тело растёт вверх по Z", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-z-up-scene");

  // Камера смотрит с +Z: «верх» экрана — мировой +Z
  expect((await cad.cameraState()).up).toEqual([0, 0, 1]);

  await cad.startSketchOnBasePlane();
  await expect(page.getByTestId("sketch-plane-label")).toHaveText("Базовая плоскость XY");

  await cad.drawRect(-SIDE / 2, -SIDE / 2, SIDE, SIDE);
  await cad.finishSketch();
  await cad.extrude({ distance: HEIGHT });

  const topo = await cad.topology();
  const size = [0, 1, 2].map((i) => topo.bbox.max[i] - topo.bbox.min[i]);
  expect(size[0]).toBeCloseTo(SIDE, 1);
  expect(size[1]).toBeCloseTo(SIDE, 1);
  expect(size[2]).toBeCloseTo(HEIGHT, 1);

  // Верх тела проецируется выше низа: сцена и геометрия согласованы визуально
  const screen = { bottom: await cad.projectPoint([0, 0, 0]), top: await cad.projectPoint([0, 0, HEIGHT]) };
  expect(screen.top[1]).toBeLessThan(screen.bottom[1]);

  expect(pageErrors).toEqual([]);
});
