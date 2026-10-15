import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { channelKinds, circle, errorCode, rect, sceneBodies, type Feature, type Topo } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

interface PatternReply extends Feature {
  bodyIds: string[];
}

test("канал: массив 2×2 ножек вырезается из плиты одной булевой операцией", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  const cad = await CadEditor.open(page, "e2e-pattern-feet");

  const plateSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(-30, -20, 30, 20)] });
  const plate = await cad.control<Feature>("extrude", { sketchId: plateSketch.sketchId, distance: 5 });
  const footSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [circle(-20, -10, 3)] });
  const foot = await cad.control<Feature>("extrude", { sketchId: footSketch.sketchId, distance: 2 });
  const plateTopo = await cad.control<Topo>("topology", { bodyId: plate.feature.bodyId });

  const grid = { bodyId: foot.feature.bodyId, type: "linear", axis: { kind: "x" }, count: 2, spacing: 40, axis2: { kind: "y" }, count2: 2, spacing2: 20 };
  expect(await errorCode(cad, "body.pattern", { ...grid, count: 1 })).toBe("invalid_params");
  const rim = (await cad.control<Topo>("topology", { bodyId: foot.feature.bodyId })).edges.find((edge) => edge.closed)!;
  expect(await errorCode(cad, "body.pattern", { ...grid, axis: { kind: "edge", bodyId: foot.feature.bodyId, edgeId: rim.id } })).toBe("operation_failed");

  const feet = await cad.control<PatternReply>("body.pattern", grid);
  expect(feet.feature.kind).toBe("pattern");
  expect(feet.bodyIds).toHaveLength(1);
  expect(feet.mode).toBe("model");
  const feetTopo = await cad.control<Topo>("topology", { bodyId: feet.bodyIds[0] });
  expect(feetTopo.bbox.min[0]).toBeCloseTo(-23, 1);
  expect(feetTopo.bbox.max[0]).toBeCloseTo(23, 1);
  expect(feetTopo.bbox.max[1]).toBeCloseTo(13, 1);
  expect((await sceneBodies(cad)).sort()).toEqual([plate.feature.bodyId, feet.bodyIds[0]].sort());

  const cut = await cad.control<Feature>("boolean", { operation: "subtract", targetBodyId: plate.feature.bodyId, toolBodyId: feet.bodyIds[0] });
  const cutTopo = await cad.control<Topo>("topology", { bodyId: cut.feature.bodyId });
  expect(cutTopo.faces.filter((face) => !face.planar)).toHaveLength(4);
  expect(cutTopo.faces.length).toBe(plateTopo.faces.length + 8);
  expect(await channelKinds(cad)).toEqual(["sketch", "extrude", "sketch", "extrude", "pattern", "boolean"]);

  await cad.control("history.undo");
  await cad.control("history.undo");
  expect((await sceneBodies(cad)).sort()).toEqual([plate.feature.bodyId, foot.feature.bodyId].sort());
  expect(pageErrors).toEqual([]);
});

test("лента: круговой массив отдельными телами и правка угла из дерева", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  const cad = await CadEditor.open(page, "e2e-pattern-ring");

  const toothSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(20, -2, 26, 2)] });
  const tooth = await cad.control<Feature>("extrude", { sketchId: toothSketch.sketchId, distance: 3 });

  await page.getByTestId("ribbon-pattern").click();
  const panel = page.getByTestId("pattern-panel");
  await expect(panel).toBeVisible();
  await expect.poll(async () => (await cad.control<{ mode: string }>("state")).mode).toBe("pattern");
  await page.getByTestId("pattern-type-circular").click();
  await page.getByTestId("pattern-axis-z").click();
  const count = panel.getByTestId("pattern-count").locator("input");
  await count.fill("4");
  await count.press("Tab");
  await page.getByTestId("pattern-mode-separate").click();
  await expect(page.getByTestId("pattern-apply")).toBeEnabled();
  await page.getByTestId("pattern-apply").click();
  await expect(panel).toHaveCount(0, { timeout: 120_000 });

  await expect.poll(async () => (await sceneBodies(cad)).length, { message: "три копии видны сразу" }).toBe(4);
  expect(await sceneBodies(cad)).toContain(tooth.feature.bodyId);
  const state = await cad.control<{ timeline: { id: string; kind: string; label: string }[] }>("state");
  const entry = state.timeline[state.timeline.length - 1];
  expect(entry.kind).toBe("pattern");
  const copies = (await sceneBodies(cad)).filter((bodyId) => bodyId !== tooth.feature.bodyId);
  const lastCopy = async () => {
    const boxes = await Promise.all(copies.map(async (bodyId) => (await cad.control<Topo>("topology", { bodyId })).bbox));
    return Math.max(...boxes.map((bbox) => bbox.min[1]));
  };
  expect(await lastCopy()).toBeCloseTo(20, 1);

  await page.getByTestId("timeline-node").filter({ hasText: entry.label }).first().click();
  const angle = page.locator("aside").getByRole("spinbutton").first();
  await angle.fill("90");
  await angle.press("Tab");
  await expect.poll(async () => {
    const boxes = await Promise.all(copies.map(async (bodyId) => (await cad.control<Topo>("topology", { bodyId })).bbox));
    return Math.min(...boxes.map((bbox) => bbox.max[0]));
  }, { message: "после угла 90° все копии в первой четверти", timeout: 60_000 }).toBeGreaterThan(-2.5);

  await cad.control("history.undo");
  await expect.poll(async () => {
    const boxes = await Promise.all(copies.map(async (bodyId) => (await cad.control<Topo>("topology", { bodyId })).bbox));
    return Math.min(...boxes.map((bbox) => bbox.min[0]));
  }, { message: "отмена вернула полный оборот" }).toBeLessThan(-20);
  expect(pageErrors).toEqual([]);
});
