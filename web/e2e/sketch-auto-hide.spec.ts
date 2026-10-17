import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

interface SketchSummary {
  id: string;
  used: boolean;
  visible: boolean;
}

async function sketches(cad: CadEditor): Promise<SketchSummary[]> {
  return (await cad.control<{ sketches: SketchSummary[] }>("state")).sketches;
}

async function outlineIds(cad: CadEditor): Promise<string[]> {
  return (await cad.control<{ sketchOutlineIds: string[] }>("scene.get")).sketchOutlineIds;
}

async function storedVisibility(cad: CadEditor, sketchId: string): Promise<unknown> {
  const res = await cad.page.request.get(`/api/projects/${cad.projectId}/document`, { headers: cad.authHeader });
  expect(res.ok(), "документ проекта").toBeTruthy();
  return (await res.json()).components[sketchId]?.visible;
}

async function extrudeCount(cad: CadEditor): Promise<number> {
  return (await cad.timeline()).filter((entry) => entry.kind === "extrude").length;
}

test("эскиз прячется после выдавливания, Ctrl+Z и глаз в дереве возвращают контур", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-sketch-auto-hide");
  await cad.startSketchOnBasePlane();
  await cad.drawRect(-10, -10, 20, 20);
  await cad.finishSketch();
  const [sketch] = await sketches(cad);
  const eye = page.getByTestId("sketch-visibility");
  await expect.poll(() => outlineIds(cad), { message: "новый эскиз виден" }).toEqual([sketch.id]);
  await expect(eye).toHaveText("видимо");

  await cad.extrude({ distance: 12 });
  await expect.poll(() => outlineIds(cad), { message: "эскиз выдавливания спрятан" }).toEqual([]);
  expect((await sketches(cad))[0]).toMatchObject({ id: sketch.id, used: true, visible: false });
  await expect(eye).toHaveText("скрыто");
  expect(await storedVisibility(cad, sketch.id), "документ не трогали: видимость по умолчанию").toBeUndefined();

  await page.reload();
  await expect(page.getByText("БРАУЗЕР МОДЕЛИ")).toBeVisible();
  await cad.install();
  await expect.poll(() => outlineIds(cad), { message: "после перезагрузки использованный эскиз не рисуется" }).toEqual([]);

  await page.keyboard.press("Control+z");
  await expect.poll(() => extrudeCount(cad), { message: "выдавливание отменено" }).toBe(0);
  await cad.idle();
  await expect.poll(() => outlineIds(cad), { message: "отмена выдавливания вернула контур" }).toEqual([sketch.id]);
  await expect(eye).toHaveText("видимо");

  await cad.control("history.redo");
  await cad.idle();
  await expect.poll(() => outlineIds(cad), { message: "повтор выдавливания снова прячет эскиз" }).toEqual([]);

  await eye.click();
  await expect(eye).toHaveText("видимо");
  await expect.poll(() => outlineIds(cad), { message: "глаз в дереве показал использованный эскиз" }).toEqual([sketch.id]);
  await expect.poll(() => storedVisibility(cad, sketch.id), { message: "явный выбор сохранён" }).toBe(true);

  await page.reload();
  await expect(page.getByText("БРАУЗЕР МОДЕЛИ")).toBeVisible();
  await cad.install();
  await expect.poll(() => outlineIds(cad), { message: "явно показанный эскиз остаётся видимым" }).toEqual([sketch.id]);

  expect(pageErrors).toEqual([]);
});

test("использованный эскиз виден, пока он выбран в панели выдавливания", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const cad = await CadEditor.open(page, "e2e-sketch-auto-hide-panel");
  await cad.startSketchOnBasePlane();
  await cad.drawRect(-10, -10, 20, 20);
  await cad.finishSketch();
  const [sketch] = await sketches(cad);
  await cad.extrude({ distance: 8 });
  await expect.poll(() => outlineIds(cad)).toEqual([]);

  const row = page.getByTestId("sketch-visibility").locator("..");
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Выдавить" }).click();
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toBeVisible();
  await expect.poll(() => outlineIds(cad), { message: "эскиз в панели операции виден" }).toEqual([sketch.id]);

  await page.getByRole("button", { name: /Отмена/ }).click();
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toHaveCount(0);
  await expect.poll(() => outlineIds(cad), { message: "панель закрыта, эскиз снова спрятан" }).toEqual([]);
});

test("sketch.setVisible в канале управления показывает и прячет использованный эскиз", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const cad = await CadEditor.open(page, "e2e-sketch-set-visible");
  const base = await cad.control<{ sketchId: string }>("sketch.create", {
    plane: "XY",
    entities: [{ type: "rectangle", corner1: { x: -10, y: -10 }, corner2: { x: 10, y: 10 } }],
  });
  await cad.control("extrude", { sketchId: base.sketchId, distance: 6 });
  await cad.idle();
  await expect.poll(() => outlineIds(cad)).toEqual([]);

  const shown = await cad.control<{ sketch: SketchSummary }>("sketch.setVisible", { sketchId: base.sketchId, visible: true });
  expect(shown.sketch).toEqual({ id: base.sketchId, used: true, visible: true });
  await expect.poll(() => outlineIds(cad)).toEqual([base.sketchId]);

  const hidden = await cad.control<{ sketch: SketchSummary }>("sketch.setVisible", { sketchId: base.sketchId, visible: false });
  expect(hidden.sketch.visible).toBe(false);
  await expect.poll(() => outlineIds(cad)).toEqual([]);
});
