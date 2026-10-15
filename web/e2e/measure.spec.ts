import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { errorCode, rect, type Feature, type Topo } from "./helpers/control";

test.use({ viewport: { width: 1680, height: 1000 } });

interface Measured {
  density: number;
  items: { kind: string; title: string; volume?: number; mass?: number; area?: number }[];
  pair: { distance: number; angle: number | null; points: number[][] } | null;
}

async function box(cad: CadEditor, x1: number, x2: number): Promise<{ bodyId: string; top: string; bottom: string }> {
  const sketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(x1, 0, x2, 10)] });
  const { feature } = await cad.control<Feature>("extrude", { sketchId: sketch.sketchId, distance: 5 });
  const topo = await cad.control<Topo>("topology", { bodyId: feature.bodyId, include: "faces" });
  const facing = (z: number) => topo.faces.find((face) => face.planar && face.normal?.[2] === z)!.id;
  return { bodyId: feature.bodyId, top: facing(1), bottom: facing(-1) };
}

test("измерения: канал управления читает размеры, не трогая модель", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const cad = await CadEditor.open(page, "e2e-measure-channel");
  const left = await box(cad, 0, 20);
  const right = await box(cad, 30, 40);
  const history = (await cad.timeline()).length;

  const body = await cad.control<Measured>("measure", { targets: [{ bodyId: left.bodyId }] });
  expect(body.items[0].volume).toBeCloseTo(1000, 3);
  expect(body.items[0].mass).toBeCloseTo(7.85, 3);
  const aluminium = await cad.control<Measured>("measure", { targets: [{ bodyId: left.bodyId }], density: 2.7 });
  expect(aluminium.items[0].mass).toBeCloseTo(2.7, 3);

  const faces = await cad.control<Measured>("measure", {
    targets: [{ bodyId: left.bodyId, faceId: left.top }, { bodyId: left.bodyId, faceId: left.bottom }],
  });
  expect(faces.pair!.distance).toBeCloseTo(5, 4);
  expect(faces.pair!.angle).toBeCloseTo(0, 4);

  const gap = await cad.control<Measured>("measure", { targets: [{ bodyId: left.bodyId }, { bodyId: right.bodyId }] });
  expect(gap.pair!.distance).toBeCloseTo(10, 4);

  const corner = await cad.control<Measured>("measure", {
    targets: [{ bodyId: left.bodyId, point: [20, 10, 5] }, { bodyId: right.bodyId, point: [30, 0, 0] }],
  });
  expect(corner.pair!.distance).toBeCloseTo(Math.hypot(10, 10, 5), 4);

  expect(await errorCode(cad, "measure", { targets: [{ bodyId: left.bodyId, faceId: "f-нет" }] })).toBe("not_found");
  expect(await errorCode(cad, "measure", { targets: [{ bodyId: "нет-тела" }] })).toBe("not_found");
  expect(await errorCode(cad, "measure", { targets: [{ bodyId: left.bodyId }, { bodyId: left.bodyId }, { bodyId: right.bodyId }] })).toBe("invalid_params");
  expect(await errorCode(cad, "measure", { targets: [{ bodyId: left.bodyId, faceId: left.top, edgeId: "e" }] })).toBe("invalid_params");

  expect((await cad.timeline()).length, "измерение не пишет в историю").toBe(history);
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("model");
});

test("измерения: инструмент в ленте, клики по граням и телам, панель с копированием", async ({ page, context }) => {
  test.setTimeout(3 * 60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const cad = await CadEditor.open(page, "e2e-measure-ui");
  await box(cad, 0, 20);
  await box(cad, 30, 40);
  const history = (await cad.timeline()).length;
  await cad.camera([20, -45, 55], [20, 5, 2.5]);

  await cad.click("Измерить");
  await expect(page.getByTestId("measure-panel")).toBeVisible();
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("measure");

  const [lx, ly] = await cad.projectPoint([10, 5, 5]);
  await page.mouse.click(lx, ly);
  await expect(page.getByTestId("measure-row-item-1-area")).toContainText("200.000 мм²");
  await expect(page.getByTestId("measure-group-item-1")).toContainText("Грань — плоская");

  const [rx, ry] = await cad.projectPoint([35, 5, 5]);
  await page.mouse.click(rx, ry);
  await expect(page.getByTestId("measure-row-pair-distance")).toContainText("10.000 мм");
  await expect(page.getByTestId("measure-row-pair-angle")).toContainText("0.00 °");
  await expect(page.getByTestId("measure-pick")).toHaveCount(2);

  await page.getByTestId("measure-row-pair-distance").getByTestId("measure-copy").dispatchEvent("click");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("10.000");

  await page.mouse.click(lx, ly);
  await expect(page.getByTestId("measure-pick"), "повторный клик снимает объект").toHaveCount(1);

  await page.getByTestId("measure-filter-body").dispatchEvent("click");
  await page.mouse.click(lx, ly);
  await expect(page.getByTestId("measure-row-item-1-volume")).toContainText("1000.000 мм³");
  await expect(page.getByTestId("measure-row-item-1-mass")).toContainText("7.85 г");
  await expect(page.getByTestId("measure-row-item-1-size")).toContainText("20.000 × 10.000 × 5.000 мм");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("measure-panel")).toBeHidden();
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("model");
  expect((await cad.timeline()).length, "инструмент ничего не пишет в историю").toBe(history);
});
