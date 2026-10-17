import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { circle, rect, sceneBodies, type Feature, type Topo } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const SIDE = 20;
const HEIGHT = 10;
const HOLE = 4;

interface FoundFaces {
  faces: { id: string; centroid: number[] }[];
}

interface Measured {
  items: { volume: number }[];
}

async function faceAt(cad: CadEditor, bodyId: string, point: number[], normal?: number[]): Promise<string> {
  const found = await cad.control<FoundFaces>("face.find", { bodyId, point, ...(normal ? { normal } : { planar: false }), limit: 1 });
  return found.faces[0].id;
}

async function volumeOf(cad: CadEditor, bodyId: string): Promise<number> {
  return (await cad.control<Measured>("measure", { targets: [{ bodyId }] })).items[0].volume;
}

async function clickTestId(cad: CadEditor, testId: string) {
  await cad.page.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    if (!element) throw new Error(`Нет элемента ${id}`);
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, testId);
  await cad.page.waitForTimeout(300);
}

async function clickModelPoint(cad: CadEditor, point: number[]) {
  const [x, y] = await cad.projectPoint(point);
  await cad.page.mouse.click(x, y);
  await cad.page.waitForTimeout(300);
}

async function lastEntry(cad: CadEditor) {
  const state = await cad.control<{ timeline: { kind: string; label: string; params: Record<string, unknown>; bodyId: string }[] }>("state");
  return state.timeline[state.timeline.length - 1];
}

async function box(cad: CadEditor, entities: unknown[]): Promise<string> {
  const sketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", offset: 0, entities });
  const extruded = await cad.control<Feature>("extrude", { sketchId: sketch.sketchId, distance: HEIGHT });
  return extruded.feature.bodyId;
}

test("сдвиг грани: грани кликом, зазор -0.07 выражением, правка смещения из дерева, отмена", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-press-pull");
  const boxId = await box(cad, [rect(0, 0, SIDE, SIDE)]);
  const top = await faceAt(cad, boxId, [10, 10, HEIGHT], [0, 0, 1]);

  await cad.camera([45, -40, 50], [10, 10, 5]);
  await clickTestId(cad, "ribbon-press-pull");
  await expect(page.getByTestId("press-pull-panel")).toBeVisible();
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("press_pull");
  await expect(page.getByTestId("press-pull-apply")).toBeDisabled();

  await clickModelPoint(cad, [10, 10, HEIGHT]);
  await expect(page.getByTestId("press-pull-face-row")).toHaveCount(1);
  await clickModelPoint(cad, [10, 10, HEIGHT]);
  await expect(page.getByTestId("press-pull-face-row")).toHaveCount(0);
  await clickModelPoint(cad, [10, 10, HEIGHT]);
  await expect(page.getByTestId("press-pull-face-row")).toContainText("Плоская грань · 400 мм²");

  const distance = page.getByTestId("press-pull-distance").locator("input");
  await distance.fill("0");
  await expect(page.getByTestId("press-pull-apply")).toBeDisabled();
  await distance.fill("-0.14/2");
  await distance.press("Enter");
  await expect(distance).toHaveValue("-0.07");
  await expect(page.getByTestId("press-pull-hint")).toContainText("внутрь");
  await clickTestId(cad, "press-pull-apply");
  await cad.idle();

  const pressed = await lastEntry(cad);
  expect(pressed.kind).toBe("press_pull");
  expect(pressed.label).toBe("Сдвиг грани 1");
  expect(pressed.params).toMatchObject({ target_body_id: boxId, face_ids: [top], new_body: false });
  expect(pressed.params.distance).toBeCloseTo(-0.07, 9);
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("model");
  expect(await sceneBodies(cad)).toEqual([pressed.bodyId]);
  expect(await volumeOf(cad, pressed.bodyId)).toBeCloseTo(SIDE * SIDE * (HEIGHT - 0.07), 3);
  expect(await faceAt(cad, pressed.bodyId, [10, 10, HEIGHT - 0.07], [0, 0, 1])).toBe(top);

  await page.getByTestId("timeline-node").filter({ hasText: "Сдвиг грани 1" }).first().dispatchEvent("click");
  const offset = page.getByLabel("Смещение");
  await offset.fill("5");
  await offset.press("Tab");
  await expect.poll(async () => (await lastEntry(cad)).params.distance, { timeout: 30_000 }).toBe(5);
  await cad.idle();
  expect(await volumeOf(cad, pressed.bodyId)).toBeCloseTo(SIDE * SIDE * (HEIGHT + 5), 3);

  await cad.control("history.undo");
  await cad.idle();
  expect((await lastEntry(cad)).params.distance).toBeCloseTo(-0.07, 9);
  await cad.control("history.undo");
  await cad.idle();
  expect(await sceneBodies(cad)).toEqual([boxId]);

  expect(pageErrors).toEqual([]);
});

test("канал: отверстие шире на 1, выдавить грань в новое тело и понятные отказы", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-press-pull-channel");
  const plateId = await box(cad, [rect(0, 0, SIDE, SIDE), circle(10, 10, HOLE)]);
  const bore = await faceAt(cad, plateId, [10 + HOLE, 10, HEIGHT / 2]);
  const top = await faceAt(cad, plateId, [2, 2, HEIGHT], [0, 0, 1]);

  const zero = await cad.request("pressPull", { bodyId: plateId, faceIds: [bore], distance: 0 });
  expect(zero).toMatchObject({ ok: false, error: { code: "operation_failed" } });
  const missing = await cad.request("pressPull", { bodyId: plateId, faceIds: ["f-missing"], distance: 1 });
  expect(missing).toMatchObject({ ok: false, error: { code: "not_found" } });
  const tooDeep = await cad.request("pressPull", { bodyId: plateId, faceIds: [top], distance: -HEIGHT - 1 });
  expect(tooDeep).toMatchObject({ ok: false, error: { code: "operation_failed" } });
  expect(tooDeep.ok ? "" : tooDeep.error.message).toMatch(/Уменьшите смещение/);
  expect(await sceneBodies(cad)).toEqual([plateId]);

  const wider = await cad.control<Feature>("pressPull", { bodyId: plateId, faceIds: [bore], distance: -1 });
  expect(wider.feature.kind).toBe("press_pull");
  expect(await volumeOf(cad, wider.feature.bodyId)).toBeCloseTo(SIDE * SIDE * HEIGHT - Math.PI * (HOLE + 1) ** 2 * HEIGHT, 2);
  expect(await faceAt(cad, wider.feature.bodyId, [10 + HOLE + 1, 10, HEIGHT / 2])).toBe(bore);

  const lid = await cad.control<Feature>("pressPull", { bodyId: wider.feature.bodyId, faceIds: [top], distance: 3, newBody: true });
  expect(lid.feature.params).toMatchObject({ distance: 3, new_body: true });
  expect((await sceneBodies(cad)).sort()).toEqual([wider.feature.bodyId, lid.feature.bodyId].sort());
  const lidTopo = await cad.control<Topo>("topology", { bodyId: lid.feature.bodyId });
  expect(lidTopo.bbox.min[2]).toBeCloseTo(HEIGHT, 3);
  expect(lidTopo.bbox.max[2]).toBeCloseTo(HEIGHT + 3, 3);

  await cad.control("history.undo");
  await cad.idle();
  expect(await sceneBodies(cad)).toEqual([wider.feature.bodyId]);

  expect(pageErrors).toEqual([]);
});
