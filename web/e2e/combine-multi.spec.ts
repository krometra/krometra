import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { channelKinds, circle, errorCode, rect, sceneBodies, type Feature } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const ROD_VOLUME = Math.PI * 4 * 10;

interface TimelineState {
  timeline: { id: string; kind: string; label: string; params: Record<string, unknown> }[];
}

async function volumeOf(cad: CadEditor, bodyId: string): Promise<number> {
  const reply = await cad.control<{ items: { volume: number }[] }>("measure", { targets: [{ bodyId }] });
  return reply.items[0].volume;
}

async function body(cad: CadEditor, entities: Record<string, unknown>[], distance = 10, offset = 0): Promise<Feature> {
  const sketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", offset, entities });
  return cad.control<Feature>("extrude", { sketchId: sketch.sketchId, distance });
}

async function lastEntry(cad: CadEditor) {
  const state = await cad.control<TimelineState>("state");
  return state.timeline[state.timeline.length - 1];
}

async function pickInTree(page: Page, bodyId: string) {
  await page.locator(`[data-tree-body="${bodyId}"]`).dispatchEvent("click");
}

test("Combine: цель и два инструмента кликами в дереве, «Сохранить инструменты», пересборка и отмена", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  const cad = await CadEditor.open(page, "e2e-combine-multi");

  const cube = (await body(cad, [rect(0, 0, 20, 10)])).feature.bodyId;
  const rodA = (await body(cad, [circle(5, 5, 2)])).feature.bodyId;
  const rodB = (await body(cad, [circle(15, 5, 2)])).feature.bodyId;

  await page.getByTestId("ribbon-boolean").click();
  await expect(page.getByTestId("boolean-panel")).toBeVisible();
  await pickInTree(page, cube);
  await pickInTree(page, rodA);
  await pickInTree(page, rodB);
  const tools = page.getByTestId("boolean-tools-row");
  await expect(tools).toHaveCount(2);
  await page.getByTestId("boolean-tools-remove").last().dispatchEvent("click");
  await expect(tools).toHaveCount(1);
  await pickInTree(page, rodB);
  await expect(tools).toHaveCount(2);
  await expect.poll(async () => (await cad.control<{ booleanBodies: { targetId: string; toolIds: string[] } }>("selection.get")).booleanBodies)
    .toEqual({ targetId: cube, toolId: rodA, toolIds: [rodA, rodB] });

  await page.getByTestId("boolean-op-subtract").dispatchEvent("click");
  await page.getByTestId("boolean-keep-tools").click();
  await page.getByTestId("boolean-apply").dispatchEvent("click");
  await expect.poll(async () => (await channelKinds(cad)).at(-1), { timeout: 60_000 }).toBe("boolean");
  await cad.idle();

  const entry = await lastEntry(cad);
  expect(entry.params.keep_tools).toBe(true);
  const result = (await sceneBodies(cad)).find((bodyId) => ![cube, rodA, rodB].includes(bodyId))!;
  expect((await sceneBodies(cad)).sort()).toEqual([result, rodA, rodB].sort());
  expect(await volumeOf(cad, result)).toBeCloseTo(2000 - 2 * ROD_VOLUME, 1);
  expect(await volumeOf(cad, rodB)).toBeCloseTo(ROD_VOLUME, 1);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("boolean-panel")).toHaveCount(0);

  await cad.control("history.undo");
  expect((await sceneBodies(cad)).sort()).toEqual([cube, rodA, rodB].sort());

  const union = await cad.control<Feature>("boolean", { operation: "union", targetBodyId: cube, toolBodyIds: [rodA, rodB] });
  expect(await sceneBodies(cad)).toEqual([union.feature.bodyId]);
  expect(await volumeOf(cad, union.feature.bodyId)).toBeCloseTo(2000, 1);

  const state = await cad.control<TimelineState>("state");
  const rodBEntry = state.timeline.filter((item) => item.kind === "extrude")[2];
  await page.getByTestId("timeline-node").filter({ hasText: rodBEntry.label }).first().click();
  const distance = page.locator("aside").getByRole("spinbutton").first();
  await distance.fill("15");
  await distance.press("Tab");
  await expect.poll(async () => volumeOf(cad, union.feature.bodyId), {
    message: "правка инструмента пересобрала объединение: торчащая часть второго цилиндра",
    timeout: 60_000,
  }).toBeCloseTo(2000 + Math.PI * 4 * 5, 1);

  expect(await errorCode(cad, "boolean", { operation: "union", targetBodyId: cube, toolBodyIds: [] })).toBe("invalid_params");
  expect(pageErrors).toEqual([]);
});

test("вырез одной операцией через два соседних бруска: состав тел в панели, пропуск незадетого тела, отмена", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  const cad = await CadEditor.open(page, "e2e-objects-to-cut");

  const barA = (await body(cad, [rect(0, 0, 10, 10)])).feature.bodyId;
  const barB = (await body(cad, [rect(10, 0, 20, 10)])).feature.bodyId;
  const far = (await body(cad, [rect(100, 0, 110, 10)])).feature.bodyId;
  await cad.control("sketch.create", { plane: "XY", offset: 10, entities: [rect(5, 2, 15, 8)] });

  await cad.click("Выдавить");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toBeVisible();
  await page.locator("select").filter({ has: page.locator('option[value="cut"]') }).selectOption("cut");
  const targets = page.getByTestId("extrude-cut-targets-row");
  await expect(targets, "по умолчанию в списке все видимые тела").toHaveCount(3);
  await page.locator(`[data-testid="extrude-cut-targets-row"][data-body-id="${far}"]`).getByTestId("extrude-cut-targets-remove").dispatchEvent("click");
  await expect(targets).toHaveCount(2);
  await pickInTree(page, far);
  await expect(targets).toHaveCount(3);
  const distance = page.getByTestId("extrude-distance");
  await distance.fill("4");
  await distance.press("Enter");
  await page.getByTestId("extrude-apply").dispatchEvent("click");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toHaveCount(0, { timeout: 60_000 });
  await cad.idle();

  const entry = await lastEntry(cad);
  expect(entry.kind).toBe("extrude");
  expect(entry.params).toMatchObject({ operation: "cut", target_body_ids: [barA, barB] });
  const visible = await sceneBodies(cad);
  expect(visible).toContain(far);
  expect(visible).not.toContain(barA);
  expect(visible).not.toContain(barB);
  const results = visible.filter((bodyId) => bodyId !== far);
  expect(results).toHaveLength(2);
  for (const bodyId of results) expect(await volumeOf(cad, bodyId)).toBeCloseTo(1000 - 5 * 6 * 4, 1);
  expect(await volumeOf(cad, far)).toBeCloseTo(1000, 1);

  await cad.control("history.undo");
  expect((await sceneBodies(cad)).sort()).toEqual([barA, barB, far].sort());

  const pocket = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", offset: 10, entities: [rect(5, 2, 15, 8)] });
  expect(await errorCode(cad, "extrude", { sketchId: pocket.sketchId, distance: 4, operation: "cut", targetBodyIds: [far] })).toBe("operation_failed");
  expect(await errorCode(cad, "extrude", { sketchId: pocket.sketchId, distance: 4, operation: "join", targetBodyIds: [barA] })).toBe("invalid_params");
  const cut = await cad.control<Feature>("extrude", { sketchId: pocket.sketchId, distance: 4, operation: "cut", targetBodyIds: [barA, barB, far] });
  expect(cut.feature.params.target_body_ids).toEqual([barA, barB]);
  expect((await sceneBodies(cad)).length).toBe(3);
  expect(pageErrors).toEqual([]);
});
