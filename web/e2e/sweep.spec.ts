import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { circle, errorCode, rect, sceneBodies, type Feature, type Topo } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const line = (x1: number, y1: number, x2: number, y2: number) => ({ type: "line", start: { x: x1, y: y1 }, end: { x: x2, y: y2 } });
const arc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => ({ type: "arc", center: { x, y }, radius, startAngle, endAngle });

interface EditorState {
  mode: string;
  sketches: { id: string; name: string }[];
  timeline: { id: string; kind: string; name: string; params: Record<string, unknown>; bodyId: string | null }[];
}

async function sketch(cad: CadEditor, plane: string, entities: unknown[], offset?: number): Promise<string> {
  return (await cad.control<{ sketchId: string }>("sketch.create", { plane, entities, ...(offset === undefined ? {} : { offset }) })).sketchId;
}

function timelineNode(page: Page, name: string) {
  return page.getByTestId("timeline-node").filter({ has: page.getByText(name, { exact: true }) });
}

test("канал: вырез канала по траектории, понятные ошибки пути, правка ориентации и пути с пересборкой", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-sweep");

  const block = await cad.control<Feature>("extrude", { sketchId: await sketch(cad, "XY", [rect(-10, -10, 10, 10)]), distance: 30 });
  const profileId = await sketch(cad, "XY", [circle(0, 0, 2)], 30);
  const pathId = await sketch(cad, "XZ", [line(0, 30, 0, 15), arc(8, 15, 8, Math.PI, 1.5 * Math.PI)]);

  expect(await errorCode(cad, "sweep", { profileSketchId: profileId, pathSketchId: profileId })).toBe("invalid_params");
  expect(await errorCode(cad, "sweep", { profileSketchId: profileId, pathSketchId: pathId, operation: "cut" })).toBe("invalid_params");

  const farPathId = await sketch(cad, "XZ", [line(0, 10, 0, 20)]);
  const far = await cad.request("sweep", { profileSketchId: profileId, pathSketchId: farPathId });
  expect(far).toMatchObject({ ok: false, error: { code: "operation_failed" } });
  expect(far.ok ? "" : far.error.message).toContain("не начинается в плоскости профиля");
  expect((await cad.control<EditorState>("state")).mode).toBe("model");

  const channel = await cad.control<Feature>("sweep", {
    profileSketchId: profileId, pathSketchId: pathId, operation: "cut", targetBodyId: block.feature.bodyId,
  });
  expect(channel.feature.kind).toBe("sweep");
  expect(channel.feature.params).toMatchObject({ path_sketch_id: pathId, orientation: "corrected", operation: "cut", target_body_id: block.feature.bodyId });
  expect(channel.mode).toBe("model");
  expect(await sceneBodies(cad)).toEqual([channel.feature.bodyId]);
  const cut = await cad.control<Topo>("topology", { bodyId: channel.feature.bodyId });
  expect(cut.faces.filter((face) => !face.planar).length).toBeGreaterThanOrEqual(2);
  expect((await cad.control<{ openEdges: number }>("mesh.stats", { bodyId: channel.feature.bodyId })).openEdges).toBe(0);

  const rodProfileId = await sketch(cad, "XY", [circle(0, 0, 2)], 50);
  const rodPathId = await sketch(cad, "XZ", [line(0, 50, 0, 60)]);
  const rod = await cad.control<Feature>("sweep", { profileSketchId: rodProfileId, pathSketchId: rodPathId });
  expect((await cad.control<Topo>("topology", { bodyId: rod.feature.bodyId })).bbox.max[2]).toBeCloseTo(60, 1);

  const state = await cad.control<EditorState>("state");
  const rodEntry = state.timeline.find((entry) => entry.bodyId === rod.feature.bodyId)!;
  await timelineNode(page, rodEntry.name).click();
  await page.locator("label", { hasText: "Ориентация" }).locator("xpath=following-sibling::button[1]").click();
  await page.getByRole("option", { name: "По Френе" }).click();
  await expect.poll(async () => {
    const entry = (await cad.control<EditorState>("state")).timeline.find((candidate) => candidate.id === rodEntry.id);
    return entry?.params.orientation;
  }, { timeout: 30_000 }).toBe("frenet");
  await cad.idle();

  const pathName = state.sketches.find((candidate) => candidate.id === rodPathId)!.name;
  await timelineNode(page, pathName).click();
  await cad.click("Редактировать эскиз");
  await expect.poll(async () => (await cad.control<EditorState>("state")).mode).toBe("sketch");
  await cad.control("sketch.addEntities", { entities: [line(0, 60, 0, 70)] });
  await cad.control("sketch.finish");
  await cad.idle();
  await expect.poll(async () => (await cad.control<Topo>("topology", { bodyId: rod.feature.bodyId })).bbox.max[2], { timeout: 30_000 }).toBeCloseTo(70, 1);
  expect((await cad.control<EditorState>("state")).timeline.map((entry) => entry.kind).filter((kind) => kind === "sweep")).toHaveLength(2);

  await cad.control("history.undo");
  await cad.control("history.undo");
  await cad.control("history.undo");
  await cad.idle();
  expect((await cad.control<EditorState>("state")).timeline.some((entry) => entry.bodyId === rod.feature.bodyId)).toBe(false);

  expect(pageErrors).toEqual([]);
});

test("лента: «По траект.» подставляет профиль и путь и строит тело", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-sweep-ribbon");
  await sketch(cad, "XY", [rect(-2, -2, 2, 2)]);
  await sketch(cad, "XZ", [line(0, 0, 0, 10), arc(10, 10, 10, 0.5 * Math.PI, Math.PI)]);

  await page.getByTestId("ribbon-sweep").click();
  await expect(page.getByTestId("sweep-panel")).toBeVisible();
  await expect.poll(async () => (await cad.control<EditorState>("state")).mode).toBe("sweep");
  await expect(page.getByTestId("sweep-error")).toHaveCount(0);
  await page.getByTestId("sweep-apply").click();

  await expect.poll(async () => (await cad.control<EditorState>("state")).timeline.map((entry) => entry.kind), { timeout: 30_000 })
    .toContain("sweep");
  await cad.idle();
  await expect(page.getByTestId("sweep-panel")).toHaveCount(0);
  const [bodyId] = await sceneBodies(cad);
  const elbow = await cad.control<Topo>("topology", { bodyId });
  expect(elbow.bbox.min[2]).toBeCloseTo(0, 1);
  expect(elbow.bbox.max[0]).toBeCloseTo(10, 1);
  expect(elbow.bbox.max[2]).toBeCloseTo(22, 1);

  expect(pageErrors).toEqual([]);
});
