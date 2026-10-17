import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { circle, errorCode, rect, type Feature } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

interface Region {
  key: string;
  area: number;
  point: [number, number];
  holes: number;
}

interface EditorState {
  mode: string;
  sketches: { id: string; name: string }[];
  timeline: { id: string; kind: string; params: Record<string, unknown>; bodyId: string | null }[];
}

interface Measured {
  items: { volume?: number }[];
}

const insideBoth = (radius: number) => 5 * Math.sqrt(radius * radius - 25) + radius * radius * Math.asin(5 / radius);
const DEPTH = 5;

async function regionsOf(cad: CadEditor, sketchId: string): Promise<Region[]> {
  return (await cad.control<{ regions: Region[] }>("sketch.regions", { sketchId })).regions;
}

async function volumeOf(cad: CadEditor, bodyId: string): Promise<number> {
  return (await cad.control<Measured>("measure", { targets: [{ bodyId }] })).items[0].volume ?? 0;
}

function byArea(regions: Region[], area: number): Region {
  const found = regions.find((region) => Math.abs(region.area - area) < 1e-3);
  if (!found) throw new Error(`нет региона площадью ${area}: ${JSON.stringify(regions)}`);
  return found;
}

function timelineNode(page: Page, name: string) {
  return page.getByTestId("timeline-node").filter({ has: page.getByText(name, { exact: true }) });
}

async function clickRegion(cad: CadEditor, region: Region, shift = false) {
  const [x, y] = await cad.projectPoint([region.point[0], region.point[1], 0]);
  await cad.page.mouse.move(x, y);
  if (shift) await cad.page.keyboard.down("Shift");
  await cad.page.mouse.click(x, y);
  if (shift) await cad.page.keyboard.up("Shift");
}

test("канал: регионы эскиза, выдавливание одной области и пересборка после правки размера", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-profile-regions");
  const { sketchId } = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [circle(0, 0, 10), rect(0, -5, 20, 5)] });

  const regions = await regionsOf(cad, sketchId);
  expect(regions).toHaveLength(3);
  const lens = byArea(regions, insideBoth(10));
  byArea(regions, 200 - insideBoth(10));
  byArea(regions, 100 * Math.PI - insideBoth(10));

  expect(await errorCode(cad, "extrude", { sketchId, distance: DEPTH, profileRegions: ["rнет"] })).toBe("not_found");
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("model");

  const lensBody = await cad.control<Feature>("extrude", { sketchId, distance: DEPTH, profileRegions: [lens.key] });
  expect(lensBody.feature.params.profile_regions).toEqual([lens.key]);
  expect(await volumeOf(cad, lensBody.feature.bodyId)).toBeCloseTo(insideBoth(10) * DEPTH, 2);
  expect((await cad.timeline()).at(-1)?.params.profile_regions).toEqual([lens.key]);

  const state = await cad.control<EditorState>("state");
  await timelineNode(page, state.sketches.find((candidate) => candidate.id === sketchId)!.name).click();
  await cad.click("Редактировать эскиз");
  await expect.poll(async () => (await cad.control<EditorState>("state")).mode).toBe("sketch");
  const entities = (await cad.control<{ entities: { id: string; type: string }[] }>("sketch.get")).entities;
  const circleId = entities.find((entity) => entity.type === "circle")!.id;
  await cad.control("sketch.addConstraint", { type: "radius", anchors: [{ entityId: circleId }], value: 12 });
  await cad.control("sketch.finish");
  await cad.idle();

  const edited = await regionsOf(cad, sketchId);
  const editedLens = edited.find((region) => region.key === lens.key);
  expect(editedLens, "ключ региона пережил правку радиуса").toBeTruthy();
  expect(editedLens!.area).toBeGreaterThan(lens.area);
  const rebuilt = (await cad.control<EditorState>("state")).timeline.find((entry) => entry.kind === "extrude")!;
  await expect.poll(async () => volumeOf(cad, rebuilt.bodyId!), { timeout: 30_000 }).toBeCloseTo(editedLens!.area * DEPTH, 1);

  expect(pageErrors).toEqual([]);
});

test("вьюпорт: клик выбирает регион, Shift добавляет, выдавливается только выбранное", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-profile-regions-ui");
  const { sketchId } = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [circle(0, 0, 10), rect(0, -5, 20, 5)] });
  const regions = await regionsOf(cad, sketchId);
  const lens = byArea(regions, insideBoth(10));
  const crescent = byArea(regions, 100 * Math.PI - insideBoth(10));
  const tail = byArea(regions, 200 - insideBoth(10));

  await cad.click("Выдавить");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toBeVisible();
  await expect(page.getByTestId("profile-regions")).toHaveText("Весь эскиз · регионов 3");
  await cad.camera([5, -30, 60], [5, 0, 0]);

  await clickRegion(cad, tail);
  await expect(page.getByTestId("profile-regions")).toHaveText("Выбрано регионов: 1 из 3");
  await clickRegion(cad, lens);
  await clickRegion(cad, crescent, true);
  await expect(page.getByTestId("profile-regions")).toHaveText("Выбрано регионов: 2 из 3");

  await page.getByTestId("extrude-distance").fill(String(DEPTH));
  await page.getByTestId("extrude-distance").dispatchEvent("change");
  await page.getByTestId("extrude-apply").dispatchEvent("click");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toHaveCount(0, { timeout: 60_000 });
  await cad.idle();

  const entry = (await cad.control<EditorState>("state")).timeline.find((candidate) => candidate.kind === "extrude")!;
  expect([...(entry.params.profile_regions as string[])].sort()).toEqual([lens.key, crescent.key].sort());
  expect(await volumeOf(cad, entry.bodyId!)).toBeCloseTo(100 * Math.PI * DEPTH, 1);

  await cad.control("history.undo");
  await cad.idle();
  expect((await cad.control<EditorState>("state")).timeline.some((candidate) => candidate.kind === "extrude")).toBe(false);

  expect(pageErrors).toEqual([]);
});
