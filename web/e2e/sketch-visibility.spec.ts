import { expect, test } from "@playwright/test";
import { CadEditor, expectEditorOpen } from "./helpers/cad";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

interface SketchSummary {
  id: string;
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

test("глаз эскиза в дереве прячет контур, состояние живёт в документе, скрытый эскиз остаётся профилем", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-sketch-visibility");
  await cad.startSketchOnBasePlane();
  await cad.drawRect(-10, -10, 20, 20);
  await cad.finishSketch();

  const [sketch] = await sketches(cad);
  expect(sketch.visible).toBe(true);
  await expect.poll(() => outlineIds(cad), { message: "контур эскиза во вьюпорте" }).toEqual([sketch.id]);

  const eye = page.getByTestId("sketch-visibility");
  await expect(eye).toHaveText("видимо");
  await eye.click();
  await expect(eye).toHaveText("скрыто");
  await expect.poll(() => outlineIds(cad), { message: "контур скрытого эскиза убран" }).toEqual([]);
  await expect.poll(() => storedVisibility(cad, sketch.id), { message: "видимость сохранена" }).toBe(false);

  await page.reload();
  await expectEditorOpen(page);
  await cad.install();
  await expect(page.getByTestId("sketch-visibility")).toHaveText("скрыто");
  await expect.poll(() => outlineIds(cad), { message: "после перезагрузки эскиз всё ещё скрыт" }).toEqual([]);

  await page.getByTestId("sketch-visibility").locator("..").click({ position: { x: 24, y: 8 } });
  const selected = await cad.control<{ featureId: string | null }>("selection.get");
  const timeline = await cad.control<{ timeline: { id: string; sketchId: string | null }[] }>("state");
  expect(selected.featureId, "скрытый эскиз выбирается в дереве").toBe(
    timeline.timeline.find((entry) => entry.sketchId === sketch.id)?.id,
  );

  await cad.extrude({ distance: 12 });
  expect(await cad.visibleBodyCount(), "скрытый эскиз выдавился").toBe(1);
  const shape = await cad.topology();
  expect(shape.bbox.max[2]).toBeCloseTo(12, 3);
  expect(await outlineIds(cad), "выдавливание не возвращает скрытый контур").toEqual([]);

  await page.getByTestId("sketch-visibility").click();
  await expect(page.getByTestId("sketch-visibility")).toHaveText("видимо");
  await expect.poll(() => outlineIds(cad), { message: "контур вернулся" }).toEqual([sketch.id]);
  await expect.poll(() => storedVisibility(cad, sketch.id)).toBe(true);

  expect(pageErrors).toEqual([]);
});

test("правка скрытого эскиза не делает его видимым", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const cad = await CadEditor.open(page, "e2e-sketch-visibility-edit");
  await cad.startSketchOnBasePlane();
  await cad.drawRect(-10, -10, 20, 20);
  await cad.finishSketch();
  const [sketch] = await sketches(cad);

  const row = page.getByTestId("sketch-visibility").locator("..");
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Скрыть" }).click();
  await expect.poll(() => storedVisibility(cad, sketch.id)).toBe(false);

  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Редактировать эскиз" }).click();
  await expect(page.locator("[data-sketch-ui]")).toBeVisible();
  await cad.drawRect(20, 20, 5, 5);
  await cad.finishSketch();

  await expect.poll(async () => (await sketches(cad))[0]?.visible, { message: "эскиз остался скрытым" }).toBe(false);
  expect(await storedVisibility(cad, sketch.id)).toBe(false);
  await expect.poll(() => outlineIds(cad)).toEqual([]);
  await expect(page.getByTestId("sketch-visibility")).toHaveText("скрыто");
});
