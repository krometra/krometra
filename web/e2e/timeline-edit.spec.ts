import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { circle, isVertical, rect, sceneBodies, type Feature, type Topo } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

interface Entry {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  suppressed: boolean;
  rolledBack: boolean;
  bodyId: string | null;
}

interface TimelineReply {
  failed: Entry[];
  marker: number;
}

async function timeline(cad: CadEditor): Promise<Entry[]> {
  return (await cad.control<{ timeline: Entry[] }>("state")).timeline;
}

async function faces(cad: CadEditor, bodyId: string): Promise<number> {
  return (await cad.control<Topo>("topology", { bodyId, include: "faces" })).faces.length;
}

async function settled(cad: CadEditor) {
  await expect.poll(async () => (await cad.control<{ busy: boolean }>("state")).busy, { timeout: 60_000 }).toBe(false);
}

function node(page: Page, index: number) {
  return page.getByTestId("timeline-node").nth(index);
}

async function buildPocketedPlate(cad: CadEditor) {
  const plateSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(0, 0, 40, 20)] });
  const plate = await cad.control<Feature>("extrude", { sketchId: plateSketch.sketchId, distance: 10 });
  const plateTopo = await cad.control<Topo>("topology", { bodyId: plate.feature.bodyId, include: "edges" });
  const vertical = plateTopo.edges.filter(isVertical).map((edge) => edge.id);
  expect(vertical).toHaveLength(4);
  const fillet = await cad.control<Feature>("fillet", { bodyId: plate.feature.bodyId, edgeIds: vertical, radius: 3 });
  const pocketSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", offset: 10, entities: [circle(20, 10, 4)] });
  const pocket = await cad.control<Feature>("extrude", {
    sketchId: pocketSketch.sketchId, distance: 5, operation: "cut", targetBodyId: fillet.feature.bodyId,
  });
  return { plate, fillet, pocket, pocketSketchId: pocketSketch.sketchId };
}

test("удаление, подавление и откат по истории пересобирают зависимые и отменяются одним Ctrl+Z", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  const cad = await CadEditor.open(page, "e2e-timeline-edit");
  const { plate, fillet, pocket } = await buildPocketedPlate(cad);
  const rounded = await faces(cad, pocket.feature.bodyId);
  expect(await sceneBodies(cad)).toEqual([pocket.feature.bodyId]);

  const suppressed = await cad.control<TimelineReply>("timeline.suppress", { featureId: fillet.feature.id, suppressed: true });
  expect(suppressed.failed).toEqual([]);
  expect((await timeline(cad)).find((entry) => entry.id === fillet.feature.id)?.suppressed).toBe(true);
  expect(await sceneBodies(cad)).toEqual([pocket.feature.bodyId]);
  expect(await faces(cad, pocket.feature.bodyId)).toBe(rounded - 4);

  await cad.control("history.undo");
  expect((await timeline(cad)).find((entry) => entry.id === fillet.feature.id)?.suppressed).toBe(false);
  expect(await faces(cad, pocket.feature.bodyId)).toBe(rounded);

  const deleted = await cad.control<TimelineReply>("timeline.delete", { featureId: fillet.feature.id });
  expect(deleted.failed).toEqual([]);
  expect((await timeline(cad)).map((entry) => entry.id)).not.toContain(fillet.feature.id);
  expect(await sceneBodies(cad)).toEqual([pocket.feature.bodyId]);
  expect(await faces(cad, pocket.feature.bodyId)).toBe(rounded - 4);
  await cad.control("history.undo");
  expect((await timeline(cad)).map((entry) => entry.id)).toContain(fillet.feature.id);
  expect(await faces(cad, pocket.feature.bodyId)).toBe(rounded);

  const rolled = await cad.control<TimelineReply>("timeline.rollback", { afterFeatureId: plate.feature.id });
  expect(rolled.marker).toBe(2);
  expect(await sceneBodies(cad)).toEqual([plate.feature.bodyId]);
  expect((await timeline(cad)).slice(2).every((entry) => entry.rolledBack)).toBe(true);

  const bossSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", offset: 10, entities: [rect(30, 5, 36, 15)] });
  const boss = await cad.control<Feature>("extrude", { sketchId: bossSketch.sketchId, distance: 5, operation: "join", targetBodyId: plate.feature.bodyId });
  const order = (await timeline(cad)).map((entry) => entry.id);
  expect(order.indexOf(boss.feature.id)).toBe(3);
  expect(order.indexOf(fillet.feature.id)).toBe(4);
  expect(await sceneBodies(cad)).toEqual([boss.feature.bodyId]);

  await cad.control("timeline.rollback");
  await settled(cad);
  expect(await sceneBodies(cad)).toEqual([pocket.feature.bodyId]);
  const full = await cad.control<Topo>("topology", { bodyId: pocket.feature.bodyId, include: "faces" });
  expect(full.bbox.max[2]).toBeCloseTo(15, 2);
  expect((await timeline(cad)).every((entry) => entry.status === "ok")).toBe(true);

  await cad.control("timeline.rollback", { afterFeatureId: plate.feature.id });
  const trimmed = await cad.control<TimelineReply>("timeline.deleteAfterMarker");
  expect(trimmed.marker).toBe(2);
  expect((await timeline(cad)).map((entry) => entry.kind)).toEqual(["sketch", "extrude"]);
  expect(await sceneBodies(cad)).toEqual([plate.feature.bodyId]);
  await cad.control("history.undo");
  expect((await timeline(cad)).length).toBe(order.length);
  await cad.control("timeline.rollback");
  expect(await sceneBodies(cad)).toEqual([pocket.feature.bodyId]);

  expect(pageErrors).toEqual([]);
});

test("контекстное меню, клавиша Delete, маркер и предупреждение при удалении эскиза", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  const cad = await CadEditor.open(page, "e2e-timeline-ui");
  const { fillet, pocket, pocketSketchId } = await buildPocketedPlate(cad);
  const filletIndex = (await timeline(cad)).findIndex((entry) => entry.id === fillet.feature.id);

  await node(page, filletIndex).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Подавить", exact: true }).click();
  await expect(node(page, filletIndex)).toHaveAttribute("data-state", "suppressed");
  await settled(cad);
  await page.keyboard.press("Control+z");
  await expect(node(page, filletIndex)).toHaveAttribute("data-state", "active");
  await settled(cad);

  await node(page, filletIndex).click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("timeline-node")).toHaveCount(4);
  await settled(cad);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("timeline-node")).toHaveCount(5);
  await settled(cad);

  await page.getByTestId("timeline-marker").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(node(page, 4)).toHaveAttribute("data-state", "rolled-back");
  await settled(cad);
  expect(await sceneBodies(cad)).toEqual([fillet.feature.bodyId]);
  await page.getByTestId("timeline-marker").focus();
  await page.keyboard.press("ArrowRight");
  await expect(node(page, 4)).toHaveAttribute("data-state", "active");
  await settled(cad);

  const sketchIndex = (await timeline(cad)).findIndex((entry, index) => entry.kind === "sketch" && index > 0);
  await node(page, sketchIndex).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Удалить", exact: true }).click();
  const dialog = page.getByTestId("sketch-delete-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Удалить эскиз" }).click();
  await expect(node(page, sketchIndex)).toHaveAttribute("data-state", "error");
  await settled(cad);
  const broken = (await timeline(cad)).find((entry) => entry.id === pocket.feature.id);
  expect(broken?.error).toContain("не найден");
  expect(await sceneBodies(cad)).toEqual([fillet.feature.bodyId]);
  expect((await cad.control<{ sketches: { id: string }[] }>("state")).sketches.map((sketch) => sketch.id)).not.toContain(pocketSketchId);

  await page.keyboard.press("Control+z");
  await settled(cad);
  expect((await timeline(cad)).find((entry) => entry.id === pocket.feature.id)?.status).toBe("ok");
  expect(await sceneBodies(cad)).toEqual([pocket.feature.bodyId]);

  await cad.control("timeline.suppress", { featureId: fillet.feature.id, suppressed: true });
  await page.reload();
  await cad.install();
  expect((await timeline(cad)).find((entry) => entry.id === fillet.feature.id)?.suppressed).toBe(true);
  await expect(node(page, filletIndex)).toHaveAttribute("data-state", "suppressed");
  expect(await sceneBodies(cad)).toEqual([pocket.feature.bodyId]);

  expect(pageErrors).toEqual([]);
});
