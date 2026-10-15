import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { circle, rect, sceneBodies, type Feature, type Topo } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

interface FoundFaces {
  faces: { id: string; centroid: number[] }[];
}

async function faceAt(cad: CadEditor, bodyId: string, point: number[], normal: number[]): Promise<string> {
  const found = await cad.control<FoundFaces>("face.find", { bodyId, point, normal, limit: 1 });
  return found.faces[0].id;
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

test("оболочка: открытые грани кликом, правка толщины из дерева, отмена", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-shell");
  const sketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", offset: 5, entities: [rect(-10, -10, 10, 10)] });
  const box = await cad.control<Feature>("extrude", { sketchId: sketch.sketchId, distance: 20 });
  const boxId = box.feature.bodyId;
  const top = await faceAt(cad, boxId, [0, 0, 25], [0, 0, 1]);

  await cad.camera([45, -60, 70], [0, 0, 15]);
  await clickTestId(cad, "ribbon-shell");
  await expect(page.getByTestId("shell-panel")).toBeVisible();
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("shell");
  await expect(page.getByTestId("shell-apply")).toBeDisabled();

  await clickModelPoint(cad, [0, 0, 25]);
  await expect(page.getByTestId("shell-face-row")).toHaveCount(1);
  await clickModelPoint(cad, [0, 0, 25]);
  await expect(page.getByTestId("shell-face-row")).toHaveCount(0);
  await clickModelPoint(cad, [0, 0, 25]);
  await expect(page.getByTestId("shell-face-row")).toHaveCount(1);
  await expect(page.getByTestId("shell-face-row")).toContainText("Плоская грань · 400 мм²");

  const thickness = page.getByTestId("shell-thickness").locator("input");
  await thickness.fill("2");
  await thickness.press("Tab");
  await clickTestId(cad, "shell-apply");
  await cad.idle();

  const shell = await lastEntry(cad);
  expect(shell.kind).toBe("shell");
  expect(shell.params).toMatchObject({ target_body_id: boxId, face_ids: [top], thickness: 2, direction: "inward" });
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("model");
  expect(await sceneBodies(cad)).toEqual([shell.bodyId]);
  const hollow = await cad.control<Topo>("topology", { bodyId: shell.bodyId });
  expect(hollow.faces).toHaveLength(11);
  expect(hollow.bbox.min[2]).toBeCloseTo(5, 3);
  expect(hollow.bbox.max[0]).toBeCloseTo(10, 3);
  expect(await faceAt(cad, shell.bodyId, [0, 0, 7], [0, 0, 1])).not.toBe(top);
  expect((await cad.control<{ openEdges: number }>("mesh.stats", { bodyId: shell.bodyId })).openEdges).toBe(0);

  await page.getByTestId("timeline-node").filter({ hasText: "Оболочка 1" }).first().dispatchEvent("click");
  const wall = page.getByLabel("Толщина стенки");
  await wall.fill("3");
  await wall.press("Tab");
  await expect.poll(async () => (await lastEntry(cad)).params.thickness, { timeout: 30_000 }).toBe(3);
  await cad.idle();
  const floor = await cad.control<FoundFaces>("face.find", {
    bodyId: shell.bodyId, point: [0, 0, 8], normal: [0, 0, 1], limit: 1,
  });
  expect(floor.faces[0].centroid[2]).toBeCloseTo(8, 3);

  await cad.control("history.undo");
  await cad.idle();
  expect((await lastEntry(cad)).params.thickness).toBe(2);
  await cad.control("history.undo");
  await cad.idle();
  expect(await sceneBodies(cad)).toEqual([boxId]);

  expect(pageErrors).toEqual([]);
});

test("канал: оболочка наружу и понятный отказ при слишком толстой стенке", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-shell-channel");
  const sketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", offset: 5, entities: [circle(0, 0, 6)] });
  const rod = await cad.control<Feature>("extrude", { sketchId: sketch.sketchId, distance: 20 });
  const top = await faceAt(cad, rod.feature.bodyId, [0, 0, 25], [0, 0, 1]);

  const thick = await cad.request("shell", { bodyId: rod.feature.bodyId, faceIds: [top], thickness: 8 });
  expect(thick).toMatchObject({ ok: false, error: { code: "operation_failed" } });
  expect(thick.ok ? "" : thick.error.message).toMatch(/Толщина стенки 8 мм больше допустимой.*примерно до \d+(\.\d)? мм/);
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("model");
  expect(await sceneBodies(cad)).toEqual([rod.feature.bodyId]);

  const missing = await cad.request("shell", { bodyId: rod.feature.bodyId, faceIds: ["f-missing"], thickness: 1 });
  expect(missing).toMatchObject({ ok: false, error: { code: "not_found" } });

  const cup = await cad.control<Feature>("shell", { bodyId: rod.feature.bodyId, faceIds: [top], thickness: 1, direction: "outward" });
  expect(cup.feature.kind).toBe("shell");
  expect(cup.feature.params).toMatchObject({ thickness: 1, direction: "outward" });
  const grown = await cad.control<Topo>("topology", { bodyId: cup.feature.bodyId });
  expect(grown.bbox.max[0]).toBeCloseTo(7, 2);
  expect(grown.bbox.min[2]).toBeCloseTo(4, 2);
  expect(grown.bbox.max[2]).toBeCloseTo(25, 2);
  expect(await sceneBodies(cad)).toEqual([cup.feature.bodyId]);

  await cad.control("history.undo");
  await cad.idle();
  expect(await sceneBodies(cad)).toEqual([rod.feature.bodyId]);

  expect(pageErrors).toEqual([]);
});
