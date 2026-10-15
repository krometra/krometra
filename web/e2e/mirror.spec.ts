import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { channelKinds, circle, errorCode, rect, sceneBodies, type Feature, type Topo } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

interface MirrorGhost {
  sourceBodyId: string;
  bbox: { min: number[]; max: number[] };
}

async function box(cad: CadEditor): Promise<string> {
  const sketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(0, 0, 10, 4)] });
  return (await cad.control<Feature>("extrude", { sketchId: sketch.sketchId, distance: 2 })).feature.bodyId;
}

async function ghost(cad: CadEditor): Promise<MirrorGhost | null> {
  return (await cad.control<{ mirrorPreview: MirrorGhost | null }>("scene.get")).mirrorPreview;
}

function expectBox(actual: { min: number[]; max: number[] } | undefined, min: number[], max: number[], what: string) {
  expect(actual, what).toBeTruthy();
  min.forEach((value, axis) => expect(actual!.min[axis], `${what}: min[${axis}]`).toBeCloseTo(value, 1));
  max.forEach((value, axis) => expect(actual!.max[axis], `${what}: max[${axis}]`).toBeCloseTo(value, 1));
}

async function bodyBox(cad: CadEditor, bodyId: string) {
  return (await cad.control<Topo>("topology", { bodyId })).bbox;
}

async function lastMirror(cad: CadEditor): Promise<{ bodyId: string; params: Record<string, unknown> }> {
  const state = await cad.control<{ timeline: { kind: string; bodyId: string; params: Record<string, unknown> }[] }>("state");
  const entry = state.timeline.filter((candidate) => candidate.kind === "mirror").at(-1);
  if (!entry) throw new Error("в истории нет записи зеркала");
  return entry;
}

test("зеркало из ленты: призрак, применение, правка смещения из дерева и отмена", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-mirror-ribbon");
  const source = await box(cad);

  await cad.camera([30, -40, 30], [5, 2, 1]);
  await page.getByTestId("ribbon-mirror").dispatchEvent("click");
  await expect(page.getByTestId("mirror-panel")).toBeVisible();
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("mirror");
  await expect(page.getByTestId("mirror-apply")).toBeDisabled();

  const [x, y] = await cad.projectPoint([5, 2, 2]);
  await page.mouse.click(x, y);
  await expect(page.getByTestId("mirror-status")).toHaveText(/относительно YZ/);
  await expect(page.getByTestId("mirror-apply")).toBeEnabled();

  const across = await ghost(cad);
  expect(across?.sourceBodyId, "призрак отражает выбранное тело").toBe(source);
  expectBox(across?.bbox, [-10, 0, 0], [0, 4, 2], "призрак через YZ");

  await page.getByTestId("mirror-plane-XY").dispatchEvent("click");
  await page.getByTestId("mirror-offset").locator("input").fill("5");
  await expect.poll(async () => (await ghost(cad))?.bbox.min[2], { message: "призрак следует за смещением" }).toBeCloseTo(8, 1);
  expectBox((await ghost(cad))?.bbox, [0, 0, 8], [10, 4, 10], "призрак через XY + 5 мм");
  expect(await channelKinds(cad), "призрак ничего не строит").not.toContain("mirror");

  await page.getByTestId("mirror-apply").dispatchEvent("click");
  await expect(page.getByTestId("mirror-panel")).toHaveCount(0, { timeout: 120_000 });
  await cad.idle();
  expect(await ghost(cad), "призрак снят вместе с панелью").toBeNull();

  const mirrored = await lastMirror(cad);
  expect(mirrored.params).toMatchObject({ target_body_id: source, plane: "XY", offset: 5, face_id: null, merge: false });
  expect((await sceneBodies(cad)).sort(), "копия рядом с исходным телом").toEqual([source, mirrored.bodyId].sort());
  expectBox(await bodyBox(cad, mirrored.bodyId), [0, 0, 8], [10, 4, 10], "тело-отражение");

  await page.getByTestId("timeline-node").filter({ hasText: "Зеркало" }).first().click();
  await page.locator('aside [inputmode="decimal"]').first().fill("10");
  await expect
    .poll(async () => (await bodyBox(cad, mirrored.bodyId)).min[2], { message: "смещение из дерева пересобрало тело", timeout: 60_000 })
    .toBeCloseTo(18, 1);
  expect((await lastMirror(cad)).params.offset).toBe(10);

  await cad.control("history.undo");
  await expect.poll(async () => (await bodyBox(cad, mirrored.bodyId)).min[2], { message: "отмена правки вернула смещение" }).toBeCloseTo(8, 1);
  await cad.control("history.undo");
  await expect.poll(async () => sceneBodies(cad), { message: "отмена зеркала убрала копию" }).toEqual([source]);

  expect(pageErrors).toEqual([]);
});

test("канал: зеркало по грани с объединением и отказы", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-mirror-channel");
  const source = await box(cad);
  const xFace = (await cad.control<{ faces: { id: string }[] }>("face.find", { bodyId: source, normal: [1, 0, 0] })).faces[0].id;

  expect(await errorCode(cad, "body.mirror", { bodyId: source }), "без плоскости").toBe("invalid_params");
  expect(await errorCode(cad, "body.mirror", { bodyId: source, plane: "XY", faceId: xFace }), "две плоскости сразу").toBe("invalid_params");
  expect(await errorCode(cad, "body.mirror", { bodyId: source, faceId: "f-none" }), "чужая грань").toBe("not_found");

  const merged = await cad.control<{ bodyId: string; feature: Feature["feature"]; mode: string }>("body.mirror", { bodyId: source, faceId: xFace, merge: true });
  expect(merged.feature.kind).toBe("mirror");
  expect(merged.feature.params).toMatchObject({ face_id: xFace, plane: null, merge: true });
  expect(merged.mode).toBe("model");
  expect(await sceneBodies(cad), "исходное тело поглощено объединением").toEqual([merged.bodyId]);
  const topo = await cad.control<Topo>("topology", { bodyId: merged.bodyId });
  expectBox(topo.bbox, [0, 0, 0], [20, 4, 2], "объединённое тело");
  expect(topo.faces, "копланарные грани слились").toHaveLength(6);
  expect((await cad.control<{ openEdges: number }>("mesh.stats", { bodyId: merged.bodyId })).openEdges).toBe(0);

  expect(await errorCode(cad, "body.mirror", { bodyId: source, plane: "XY" }), "поглощённое тело").toBe("operation_failed");

  const rodSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [circle(40, 0, 3)] });
  const rod = await cad.control<Feature>("extrude", { sketchId: rodSketch.sketchId, distance: 10 });
  const rodTopo = await cad.control<Topo>("topology", { bodyId: rod.feature.bodyId });
  const side = rodTopo.faces.find((face) => !face.planar)!;
  const curved = await cad.request("body.mirror", { bodyId: rod.feature.bodyId, faceId: side.id });
  expect(curved, "неплоская грань").toMatchObject({ ok: false, error: { code: "operation_failed" } });
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("model");

  const copy = await cad.control<{ bodyId: string }>("body.mirror", { bodyId: rod.feature.bodyId, plane: "YZ", offset: 50 });
  expectBox(await bodyBox(cad, copy.bodyId), [57, -3, 0], [63, 3, 10], "копия стержня за плоскостью x = 50");
  expect((await sceneBodies(cad)).sort()).toEqual([merged.bodyId, rod.feature.bodyId, copy.bodyId].sort());

  expect(pageErrors).toEqual([]);
});
