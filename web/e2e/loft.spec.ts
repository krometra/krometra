import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { circle, errorCode, rect, sceneBodies, type Feature, type Topo } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

interface EditorState {
  mode: string;
  sketches: { id: string; name: string }[];
  timeline: { id: string; kind: string; name: string; params: Record<string, unknown>; bodyId: string | null }[];
}

const frustum = (h: number, a1: number, a2: number) => (h / 3) * (a1 + a2 + Math.sqrt(a1 * a2));

async function sketch(cad: CadEditor, entities: unknown[], offset: number, plane = "XY"): Promise<string> {
  return (await cad.control<{ sketchId: string }>("sketch.create", { plane, entities, offset })).sketchId;
}

async function volume(cad: CadEditor, bodyId: string): Promise<number> {
  const measured = await cad.control<{ items: { volume: number }[] }>("measure", { targets: [{ bodyId }] });
  return measured.items[0].volume;
}

function timelineNode(page: Page, name: string) {
  return page.getByTestId("timeline-node").filter({ has: page.getByText(name, { exact: true }) });
}

test("канал: усеченная пирамида, переход квадрат-круг, вырез из бруска, понятные ошибки профилей", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-loft");

  const bottom = await sketch(cad, [rect(-10, -10, 10, 10)], 0);
  const top = await sketch(cad, [rect(-5, -5, 5, 5)], 30);

  expect(await errorCode(cad, "loft", { sketchIds: [bottom] })).toBe("invalid_params");
  expect(await errorCode(cad, "loft", { sketchIds: [bottom, bottom] })).toBe("invalid_params");
  expect(await errorCode(cad, "loft", { sketchIds: [bottom, top], operation: "cut" })).toBe("invalid_params");

  const twoRegions = await sketch(cad, [rect(-10, -10, -2, 10), rect(2, -10, 10, 10)], 60);
  const regions = await cad.request("loft", { sketchIds: [top, twoRegions] });
  expect(regions).toMatchObject({ ok: false, error: { code: "operation_failed" } });
  expect(regions.ok ? "" : regions.error.message).toContain("замкнутых области");
  const flat = await sketch(cad, [circle(30, 0, 3)], 0);
  const coplanar = await cad.request("loft", { sketchIds: [bottom, flat] });
  expect(coplanar.ok ? "" : coplanar.error.message).toContain("в одной плоскости");
  expect((await cad.control<EditorState>("state")).mode).toBe("model");

  const pyramid = await cad.control<Feature>("loft", { sketchIds: [bottom, top] });
  expect(pyramid.feature.kind).toBe("loft");
  expect(pyramid.feature.params).toMatchObject({ profile_sketch_ids: [bottom, top], transition: "smooth", operation: "new_body" });
  expect(pyramid.mode).toBe("model");
  expect(await volume(cad, pyramid.feature.bodyId)).toBeCloseTo(frustum(30, 400, 100), 0);
  expect((await cad.control<Topo>("topology", { bodyId: pyramid.feature.bodyId })).faces).toHaveLength(6);
  expect((await cad.control<{ openEdges: number }>("mesh.stats", { bodyId: pyramid.feature.bodyId })).openEdges).toBe(0);

  const square = await sketch(cad, [rect(40, -10, 60, 10)], 0);
  const round = await sketch(cad, [circle(50, 0, 8)], 25);
  const morph = await cad.control<Feature>("loft", { sketchIds: [square, round], ruled: true });
  expect(morph.feature.params.transition).toBe("ruled");
  const morphTopo = await cad.control<Topo>("topology", { bodyId: morph.feature.bodyId });
  expect(morphTopo.bbox.min[0]).toBeCloseTo(40, 1);
  expect(morphTopo.bbox.max[2]).toBeCloseTo(25, 1);

  const block = await cad.control<Feature>("extrude", { sketchId: await sketch(cad, [rect(-15, 80, 15, 110)], 0), distance: 30 });
  const cutBottom = await sketch(cad, [rect(-10, 85, 10, 105)], 0);
  const cutTop = await sketch(cad, [rect(-5, 90, 5, 100)], 30);
  const cut = await cad.control<Feature>("loft", { sketchIds: [cutBottom, cutTop], operation: "cut", targetBodyId: block.feature.bodyId });
  expect(cut.feature.params.target_body_id).toBe(block.feature.bodyId);
  expect(await sceneBodies(cad)).not.toContain(block.feature.bodyId);
  expect(await volume(cad, cut.feature.bodyId)).toBeCloseTo(900 * 30 - frustum(30, 400, 100), 0);

  await cad.control("history.undo");
  await cad.idle();
  expect(await sceneBodies(cad)).toContain(block.feature.bodyId);

  expect(pageErrors).toEqual([]);
});

test("лента: «Лофт» подставляет профили, переход правится в свойствах, правка эскиза перестраивает тело", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-loft-ribbon");
  await sketch(cad, [rect(-10, -10, 10, 10)], 0);
  await sketch(cad, [rect(-5, -5, 5, 5)], 15);
  const topId = await sketch(cad, [circle(0, 0, 10)], 30);

  await page.getByTestId("ribbon-loft").click();
  await expect(page.getByTestId("loft-panel")).toBeVisible();
  await expect.poll(async () => (await cad.control<EditorState>("state")).mode).toBe("loft");
  await expect(page.getByTestId("loft-profile-row")).toHaveCount(3);
  await page.getByTestId("loft-profile-remove").nth(1).click();
  await expect(page.getByTestId("loft-profile-row")).toHaveCount(2);
  await expect(page.getByTestId("loft-error")).toHaveCount(0);
  await page.getByTestId("loft-apply").click();

  await expect.poll(async () => (await cad.control<EditorState>("state")).timeline.map((entry) => entry.kind), { timeout: 30_000 })
    .toContain("loft");
  await cad.idle();
  await expect(page.getByTestId("loft-panel")).toHaveCount(0);
  const [bodyId] = await sceneBodies(cad);
  const smooth = await volume(cad, bodyId);
  expect(smooth).toBeGreaterThan(400 * 30 * 0.5);

  const state = await cad.control<EditorState>("state");
  const entry = state.timeline.find((candidate) => candidate.kind === "loft")!;
  await timelineNode(page, entry.name).click();
  await page.locator("label", { hasText: "Переход" }).locator("xpath=following-sibling::button[1]").click();
  await page.getByRole("option", { name: "Линейный" }).click();
  await expect.poll(async () => {
    const current = (await cad.control<EditorState>("state")).timeline.find((candidate) => candidate.id === entry.id);
    return current?.params.transition;
  }, { timeout: 30_000 }).toBe("ruled");
  await cad.idle();

  const topName = state.sketches.find((candidate) => candidate.id === topId)!.name;
  await timelineNode(page, topName).click();
  await cad.click("Редактировать эскиз");
  await expect.poll(async () => (await cad.control<EditorState>("state")).mode).toBe("sketch");
  const opened = await cad.control<{ entities: { id: string; type: string }[] }>("sketch.get");
  const roundId = opened.entities.find((candidate) => candidate.type === "circle")!.id;
  await cad.control("sketch.addConstraint", { type: "radius", anchors: [{ entityId: roundId }], value: 5 });
  await cad.control("sketch.finish");
  await cad.idle();
  await expect.poll(async () => (await cad.control<Topo>("topology", { bodyId })).bbox.max[2], { timeout: 30_000 }).toBeCloseTo(30, 1);
  await expect.poll(async () => volume(cad, bodyId), { timeout: 30_000 }).toBeLessThan(smooth);

  expect(pageErrors).toEqual([]);
});
