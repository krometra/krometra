import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { rect, sceneBodies, type Feature, type Topo } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const SIDE = 20;
const HEIGHT = 10;
const inset = (angleDeg: number) => HEIGHT * Math.tan((angleDeg * Math.PI) / 180);

interface FoundFaces {
  faces: { id: string; centroid: number[]; area: number }[];
}

interface Measured {
  items: { volume?: number }[];
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

async function topArea(cad: CadEditor, bodyId: string): Promise<number> {
  const found = await cad.control<FoundFaces>("face.find", { bodyId, point: [0, 0, HEIGHT], normal: [0, 0, 1], limit: 1 });
  return found.faces[0].area;
}

async function box(cad: CadEditor): Promise<string> {
  const sketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(-SIDE / 2, -SIDE / 2, SIDE / 2, SIDE / 2)] });
  const extruded = await cad.control<Feature>("extrude", { sketchId: sketch.sketchId, distance: HEIGHT });
  return extruded.feature.bodyId;
}

test("уклон: грани кликом от плоскости XY, правка угла из дерева, отмена", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-draft");
  const boxId = await box(cad);
  const right = await faceAt(cad, boxId, [SIDE / 2, 0, HEIGHT / 2], [1, 0, 0]);
  const front = await faceAt(cad, boxId, [0, -SIDE / 2, HEIGHT / 2], [0, -1, 0]);

  await cad.camera([45, -60, 40], [0, 0, HEIGHT / 2]);
  await clickTestId(cad, "ribbon-draft");
  await expect(page.getByTestId("draft-panel")).toBeVisible();
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("draft");
  await expect(page.getByTestId("draft-apply")).toBeDisabled();
  await expect(page.getByTestId("draft-neutral-status")).toContainText("XY");

  await clickModelPoint(cad, [SIDE / 2, 0, HEIGHT / 2]);
  await expect(page.getByTestId("draft-face-row")).toHaveCount(1);
  await clickModelPoint(cad, [0, -SIDE / 2, HEIGHT / 2]);
  await expect(page.getByTestId("draft-face-row")).toHaveCount(2);
  await clickModelPoint(cad, [0, -SIDE / 2, HEIGHT / 2]);
  await expect(page.getByTestId("draft-face-row")).toHaveCount(1);
  await clickModelPoint(cad, [0, -SIDE / 2, HEIGHT / 2]);
  await expect(page.getByTestId("draft-face-row")).toHaveCount(2);
  await expect(page.getByTestId("draft-face-row").first()).toContainText("Плоская грань · 200 мм²");

  const angle = page.getByTestId("draft-angle");
  await angle.fill("95");
  await expect(page.getByTestId("draft-apply")).toBeDisabled();
  await angle.fill("5deg");
  await angle.press("Tab");
  await clickTestId(cad, "draft-apply");
  await cad.idle();

  const draft = await lastEntry(cad);
  expect(draft.kind).toBe("draft");
  expect(draft.params).toMatchObject({ target_body_id: boxId, face_ids: [right, front], neutral_plane: "XY", angle_deg: 5, reverse: false });
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("model");
  expect(await sceneBodies(cad)).toEqual([draft.bodyId]);
  const tapered = await cad.control<Topo>("topology", { bodyId: draft.bodyId });
  expect(tapered.faces).toHaveLength(6);
  expect(tapered.bbox.max[0]).toBeCloseTo(SIDE / 2, 3);
  expect(tapered.bbox.min[1]).toBeCloseTo(-SIDE / 2, 3);
  expect(await topArea(cad, draft.bodyId)).toBeCloseTo((SIDE - inset(5)) ** 2, 2);
  expect((await cad.control<{ openEdges: number }>("mesh.stats", { bodyId: draft.bodyId })).openEdges).toBe(0);

  await page.getByTestId("timeline-node").filter({ hasText: "Уклон 1" }).first().dispatchEvent("click");
  const edit = page.getByLabel("Угол уклона");
  await edit.fill("3");
  await edit.press("Tab");
  await expect.poll(async () => (await lastEntry(cad)).params.angle_deg, { timeout: 30_000 }).toBe(3);
  await cad.idle();
  expect(await topArea(cad, draft.bodyId)).toBeCloseTo((SIDE - inset(3)) ** 2, 2);

  await cad.control("history.undo");
  await cad.idle();
  expect((await lastEntry(cad)).params.angle_deg).toBe(5);
  await cad.control("history.undo");
  await cad.idle();
  expect(await sceneBodies(cad)).toEqual([boxId]);

  expect(pageErrors).toEqual([]);
});

test("канал: уклон от нижней грани, пересборка от высоты тела, понятные отказы", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-draft-channel");
  const boxId = await box(cad);
  const bottom = await faceAt(cad, boxId, [0, 0, 0], [0, 0, -1]);
  const top = await faceAt(cad, boxId, [0, 0, HEIGHT], [0, 0, 1]);
  const sides = await Promise.all([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]].map((normal) => (
    faceAt(cad, boxId, normal.map((value, axis) => (axis === 2 ? HEIGHT / 2 : value * SIDE / 2)), normal)
  )));

  const parallel = await cad.request("draft", { bodyId: boxId, faceIds: [top], neutral: { faceId: bottom }, angleDeg: 5 });
  expect(parallel).toMatchObject({ ok: false, error: { code: "operation_failed" } });
  expect(parallel.ok ? "" : parallel.error.message).toMatch(/параллельна нейтральной плоскости/);

  const steep = await cad.request("draft", { bodyId: boxId, faceIds: sides, neutral: { faceId: bottom }, angleDeg: 60 });
  expect(steep).toMatchObject({ ok: false, error: { code: "operation_failed" } });
  expect(steep.ok ? "" : steep.error.message).toMatch(/Уклон 60° не строится.*до \d+(\.\d)?°/);

  const zero = await cad.request("draft", { bodyId: boxId, faceIds: sides, neutral: { faceId: bottom }, angleDeg: 0 });
  expect(zero).toMatchObject({ ok: false, error: { code: "invalid_params" } });
  const both = await cad.request("draft", { bodyId: boxId, faceIds: sides, neutral: { plane: "XY", faceId: bottom } });
  expect(both).toMatchObject({ ok: false, error: { code: "invalid_params" } });
  expect(await sceneBodies(cad)).toEqual([boxId]);
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("model");

  const pyramid = await cad.control<Feature>("draft", { bodyId: boxId, faceIds: sides, neutral: { faceId: bottom }, angleDeg: 5 });
  expect(pyramid.feature.kind).toBe("draft");
  expect(pyramid.feature.params).toMatchObject({ neutral_face_id: bottom, angle_deg: 5, reverse: false });
  const narrow = SIDE - 2 * inset(5);
  const frustum = (HEIGHT / 3) * (SIDE ** 2 + narrow ** 2 + SIDE * narrow);
  const measured = await cad.control<Measured>("measure", { targets: [{ bodyId: pyramid.feature.bodyId }] });
  expect(measured.items[0].volume).toBeCloseTo(frustum, 1);

  const wide = await cad.control<Feature>("draft", { bodyId: pyramid.feature.bodyId, faceIds: [sides[0]], neutral: { plane: "XY" }, angleDeg: 2, reverse: true });
  const grown = await cad.control<Topo>("topology", { bodyId: wide.feature.bodyId });
  expect(grown.bbox.max[0]).toBeGreaterThan(SIDE / 2);

  await cad.control("history.undo");
  await cad.idle();
  await cad.control("history.undo");
  await cad.idle();
  expect(await sceneBodies(cad)).toEqual([boxId]);

  expect(pageErrors).toEqual([]);
});
