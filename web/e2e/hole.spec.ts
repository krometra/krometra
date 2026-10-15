import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { channelKinds, circle, errorCode, rect, sceneBodies, type Feature, type Topo } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const BASE = 2;
const TOP = 12;

interface FoundFaces {
  faces: { id: string }[];
}

async function plate(cad: CadEditor) {
  const sketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", offset: BASE, entities: [rect(0, 0, 40, 20)] });
  return cad.control<Feature>("extrude", { sketchId: sketch.sketchId, distance: TOP - BASE });
}

async function topFace(cad: CadEditor, bodyId: string): Promise<string> {
  const found = await cad.control<FoundFaces>("face.find", { bodyId, normal: [0, 0, 1], point: [20, 10, TOP], limit: 1 });
  return found.faces[0].id;
}

function holeWalls(topology: Topo, diameter: number) {
  return topology.faces.filter((face) => {
    if (face.planar || !face.bbox) return false;
    const width = Math.max(face.bbox.max[0] - face.bbox.min[0], face.bbox.max[1] - face.bbox.min[1]);
    return Math.abs(width - diameter) < 0.05;
  });
}

test("канал: отверстия с цековкой по точкам, насквозь по эскизу и резьба в отверстии", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-hole-channel");
  const base = await plate(cad);
  const baseTopo = await cad.control<Topo>("topology", { bodyId: base.feature.bodyId });
  const top = await topFace(cad, base.feature.bodyId);

  expect(await errorCode(cad, "hole", { bodyId: base.feature.bodyId, faceId: top, diameter: 5 }), "без центров и эскиза").toBe("invalid_params");
  expect(
    await errorCode(cad, "hole", { bodyId: base.feature.bodyId, faceId: top, diameter: 5, centers: [[100, 100, TOP]] }),
    "центр мимо грани",
  ).toBe("operation_failed");
  expect(
    await errorCode(cad, "hole", { bodyId: base.feature.bodyId, faceId: top, diameter: 5, type: "counterbore", cboreDiameter: 4, centers: [[10, 10, TOP]] }),
    "цековка уже отверстия",
  ).toBe("operation_failed");
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("model");

  const counterbored = await cad.control<Feature>("hole", {
    bodyId: base.feature.bodyId,
    faceId: top,
    centers: [[10, 10, TOP], [30, 10, TOP]],
    type: "counterbore",
    diameter: 5,
    depth: 8,
    cboreDiameter: 9,
    cboreDepth: 3,
  });
  expect(counterbored.feature.kind).toBe("hole");
  expect(counterbored.mode).toBe("model");
  expect(counterbored.feature.params).toMatchObject({ hole_type: "counterbore", diameter: 5, depth: 8, cbore_diameter: 9, cbore_depth: 3 });
  expect(counterbored.feature.params.centers).toEqual([[10, 10, TOP], [30, 10, TOP]]);
  expect(await sceneBodies(cad)).toEqual([counterbored.feature.bodyId]);

  const drilled = await cad.control<Topo>("topology", { bodyId: counterbored.feature.bodyId });
  expect(drilled.bbox).toEqual(baseTopo.bbox);
  expect(drilled.faces.length).toBe(baseTopo.faces.length + 2 * 4);
  expect(holeWalls(drilled, 5)).toHaveLength(2);
  expect(holeWalls(drilled, 9)).toHaveLength(2);
  expect((await cad.control<{ openEdges: number }>("mesh.stats", { bodyId: counterbored.feature.bodyId })).openEdges).toBe(0);

  const centers = await cad.control<{ sketchId: string }>("sketch.create", {
    plane: "XY",
    offset: TOP,
    entities: [circle(20, 5, 1), circle(20, 15, 1)],
  });
  const through = await cad.control<Feature & { feature: { sketchId: string } }>("hole", {
    bodyId: counterbored.feature.bodyId,
    faceId: await topFace(cad, counterbored.feature.bodyId),
    sketchId: centers.sketchId,
    diameter: 3,
    extent: "through_all",
  });
  expect(through.feature.sketchId).toBe(centers.sketchId);
  expect(through.feature.params).toMatchObject({ extent: "through_all", diameter: 3, centers: [[20, 5, TOP], [20, 15, TOP]] });
  const pierced = await cad.control<Topo>("topology", { bodyId: through.feature.bodyId });
  expect(holeWalls(pierced, 3)).toHaveLength(2);
  expect(holeWalls(pierced, 3).every((face) => face.bbox!.min[2] <= BASE + 1e-3 && face.bbox!.max[2] >= TOP - 1e-3)).toBe(true);

  const wall = holeWalls(pierced, 5)[0];
  const thread = await cad.control<Feature>("thread", { bodyId: through.feature.bodyId, faceId: wall.id, pitch: 0.8, length: 4 });
  expect(thread.feature.kind).toBe("thread");
  expect(thread.feature.params).toMatchObject({ kind: "internal" });

  expect(await channelKinds(cad)).toEqual(["sketch", "extrude", "hole", "sketch", "hole", "thread"]);
  await cad.control("history.undo");
  await cad.control("history.undo");
  expect(await sceneBodies(cad)).toEqual([counterbored.feature.bodyId]);
  expect(await channelKinds(cad)).toEqual(["sketch", "extrude", "hole", "sketch"]);

  expect(pageErrors).toEqual([]);
});

test("панель: клики по грани ставят центры, правка диаметра из дерева пересобирает отверстие", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-hole-panel");
  await plate(cad);
  await cad.camera([20, -40, 70], [20, 10, TOP]);

  await page.getByTestId("ribbon-hole").dispatchEvent("click");
  await expect(page.getByTestId("hole-panel")).toBeVisible();
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("hole");
  await expect(page.getByTestId("hole-apply")).toBeDisabled();

  for (const spot of [[10, 10, TOP], [30, 10, TOP]]) {
    const [x, y] = await cad.projectPoint(spot);
    await page.mouse.click(x, y);
    await page.waitForTimeout(400);
  }
  await expect(page.getByTestId("hole-status")).toContainText("2 отверстия");
  await expect(page.getByTestId("hole-centers")).toContainText("2. (");

  await page.getByTestId("hole-bottom-cone").dispatchEvent("click");
  const diameter = page.getByTestId("hole-diameter").locator("input");
  await diameter.fill("4");
  await diameter.press("Tab");
  await page.getByTestId("hole-apply").dispatchEvent("click");
  await expect(page.getByTestId("hole-panel")).toHaveCount(0, { timeout: 120_000 });
  await cad.idle();

  const state = await cad.control<{ timeline: { kind: string; bodyId: string; params: Record<string, unknown> }[] }>("state");
  const hole = state.timeline.at(-1)!;
  expect(hole.kind).toBe("hole");
  expect(hole.params).toMatchObject({ diameter: 4, bottom: "cone" });
  expect(await sceneBodies(cad)).toEqual([hole.bodyId]);
  expect(holeWalls(await cad.control<Topo>("topology", { bodyId: hole.bodyId }), 4)).toHaveLength(2);

  await page.getByTestId("timeline-node").filter({ hasText: "Отверстие" }).first().click();
  const edit = page.locator("aside").getByLabel("Диаметр", { exact: true });
  await edit.fill("6");
  await edit.press("Tab");
  await expect
    .poll(async () => holeWalls(await cad.control<Topo>("topology", { bodyId: hole.bodyId }), 6).length, {
      message: "отверстия пересобраны с новым диаметром",
      timeout: 60_000,
    })
    .toBe(2);

  expect(pageErrors).toEqual([]);
});
