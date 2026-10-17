import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1400, height: 900 } });

const CENTER = [-144, 108, 10];

test("клик по кубу видов смотрит на модель вдали от начала координат и вписывает её", async ({ page }) => {
  test.setTimeout(120_000);
  const cad = await CadEditor.open(page, "e2e-view-cube-framing");
  const { sketchId } = await cad.control<{ sketchId: string }>("sketch.create", {
    plane: "XY",
    entities: [{ type: "rectangle", corner1: { x: CENTER[0] - 20, y: CENTER[1] - 20 }, corner2: { x: CENTER[0] + 20, y: CENTER[1] + 20 } }],
  });
  await cad.control("extrude", { sketchId, distance: 20 });
  await cad.idle();

  for (const face of ["front", "top", "right"]) {
    await page.getByRole("button", { name: "Изометрия" }).click();
    await page.waitForTimeout(700);
    await page.locator(`[data-face="${face}"]`).first().dispatchEvent("click");
    await page.waitForTimeout(700);
    const camera = await cad.cameraState();
    camera.target.forEach((value, i) => expect(value, `${face}: цель на центре модели`).toBeCloseTo(CENTER[i], 0));
    const distance = Math.hypot(...camera.position.map((value, i) => value - camera.target[i]));
    expect(distance, `${face}: модель вписана, а не в 15 мм от камеры`).toBeGreaterThan(40);
    expect(distance).toBeLessThan(400);
  }

  const visible = await cad.control<{ points: { inside: boolean }[] }>("viewport.project", { points: [CENTER] });
  expect(visible.points[0].inside, "модель в кадре").toBe(true);
});
