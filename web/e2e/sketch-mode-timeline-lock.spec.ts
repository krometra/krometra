import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { circle, errorCode, rect, type Feature } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const LOCK_HINT = "Сначала закройте эскиз: ОК или Отмена";

interface Entry {
  id: string;
  kind: string;
  sketchId: string | null;
}

interface SketchState {
  active: boolean;
  id: string | null;
  loaded: boolean;
  entities: unknown[];
}

async function timeline(cad: CadEditor): Promise<Entry[]> {
  return (await cad.control<{ timeline: Entry[] }>("state")).timeline;
}

async function sketchIds(cad: CadEditor): Promise<string[]> {
  return (await cad.control<{ sketches: { id: string }[] }>("state")).sketches.map((sketch) => sketch.id);
}

async function settled(cad: CadEditor) {
  await expect.poll(async () => (await cad.control<{ busy: boolean }>("state")).busy, { timeout: 60_000 }).toBe(false);
}

function node(page: Page, index: number) {
  return page.getByTestId("timeline-node").nth(index);
}

function menuItem(page: Page, name: string) {
  return page.getByRole("menu").getByRole("menuitem", { name, exact: true });
}

test("открытый эскиз запирает историю, а «Удалить» у него самого закрывает и удаляет эскиз", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  const cad = await CadEditor.open(page, "e2e-sketch-lock");

  const base = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(0, 0, 40, 20)] });
  const plate = await cad.control<Feature>("extrude", { sketchId: base.sketchId, distance: 10 });
  const loose = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", offset: 10, entities: [circle(20, 10, 4)] });
  const entries = await timeline(cad);
  const extrudeIndex = entries.findIndex((entry) => entry.id === plate.feature.id);
  const looseIndex = entries.findIndex((entry) => entry.kind === "sketch" && entry.sketchId === loose.sketchId);
  await expect(page.getByTestId("timeline-node")).toHaveCount(3);

  await node(page, looseIndex).click({ button: "right" });
  await menuItem(page, "Редактировать эскиз").click();
  await expect
    .poll(async () => {
      const state = await cad.control<SketchState>("sketch.get");
      return state.active && state.loaded && state.id === loose.sketchId;
    }, { timeout: 15_000 })
    .toBe(true);

  const entityCount = (await cad.control<SketchState>("sketch.get")).entities.length;
  await cad.control("sketch.addEntities", { entities: [circle(5, 5, 2)] });
  expect((await cad.control<SketchState>("sketch.get")).entities).toHaveLength(entityCount + 1);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await cad.control<SketchState>("sketch.get")).entities.length).toBe(entityCount);
  expect((await cad.control<SketchState>("sketch.get")).active, "Ctrl+Z в эскизе не выходит из эскиза").toBe(true);
  await expect(page.getByTestId("timeline-node")).toHaveCount(3);

  await node(page, extrudeIndex).click({ button: "right" });
  const lockedDelete = menuItem(page, "Удалить");
  await expect(lockedDelete).toHaveAttribute("aria-disabled", "true");
  await expect(lockedDelete).toHaveAttribute("title", LOCK_HINT);
  await expect(menuItem(page, "Подавить")).toHaveAttribute("aria-disabled", "true");
  await expect(menuItem(page, "Откатить сюда")).toHaveAttribute("aria-disabled", "true");
  await expect(menuItem(page, "Переименовать")).toHaveAttribute("aria-disabled", "true");
  await expect(menuItem(page, "Показать свойства")).not.toHaveAttribute("aria-disabled", "true");
  await lockedDelete.click({ force: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByTestId("timeline-node")).toHaveCount(3);

  await node(page, extrudeIndex).click();
  await page.keyboard.press("Delete");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("timeline-node")).toHaveCount(3);
  expect((await cad.control<SketchState>("sketch.get")).active).toBe(true);

  await expect(page.getByTestId("timeline-marker")).toHaveAttribute("aria-disabled", "true");
  await page.getByTestId("timeline-marker").focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(300);
  await expect(page.locator("[data-testid='timeline-node'][data-state='rolled-back']")).toHaveCount(0);
  expect((await timeline(cad)).map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id));

  const refused = await cad.request("timeline.delete", { featureId: plate.feature.id });
  expect(refused.ok).toBe(false);
  if (!refused.ok) {
    expect(refused.error.code).toBe("wrong_mode");
    expect(refused.error.message).toContain(LOCK_HINT);
  }
  expect(await errorCode(cad, "timeline.suppress", { featureId: plate.feature.id, suppressed: true })).toBe("wrong_mode");
  expect(await errorCode(cad, "timeline.rollback", { afterFeatureId: entries[0].id })).toBe("wrong_mode");
  expect(await errorCode(cad, "body.delete", { bodyId: plate.feature.bodyId })).toBe("wrong_mode");
  expect(await errorCode(cad, "sketch.delete", { sketchId: base.sketchId })).toBe("wrong_mode");
  expect(await errorCode(cad, "body.rename", { bodyId: plate.feature.bodyId, name: "Плита" })).toBe("wrong_mode");
  expect(await timeline(cad)).toHaveLength(3);

  await node(page, looseIndex).click({ button: "right" });
  const ownDelete = menuItem(page, "Удалить");
  await expect(ownDelete).not.toHaveAttribute("aria-disabled", "true");
  await ownDelete.click();
  await expect.poll(async () => (await cad.control<SketchState>("sketch.get")).active).toBe(false);
  await expect(page.getByTestId("timeline-node")).toHaveCount(2);
  await settled(cad);
  expect(await sketchIds(cad)).not.toContain(loose.sketchId);
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("model");

  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("timeline-node")).toHaveCount(3);
  await settled(cad);
  expect(await sketchIds(cad)).toContain(loose.sketchId);

  expect(pageErrors).toEqual([]);
});
