import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CadEditor, expectEditorOpen } from "./helpers/cad";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const PLATE = 40;
const THICK = 10;

async function exportStep(page: Page): Promise<Buffer> {
  await page.getByRole("button", { name: /Экспорт/ }).click();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByText(/STEP \(\.step\)/).click()]);
  return readFileSync((await file.path())!);
}

async function importStep(page: Page, name: string, buffer: Buffer) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("import-step").click()]);
  await chooser.setFiles({ name, mimeType: "application/step", buffer });
}

test("импорт STEP: тело с топологией, булева операция и повторное открытие", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  const cad = await CadEditor.open(page, "e2e-step-import");

  await cad.startSketchOnBasePlane();
  await cad.drawRect(-PLATE / 2, -PLATE / 2, PLATE, PLATE);
  await cad.finishSketch();
  await cad.extrude({ distance: THICK });
  await expect.poll(async () => (await cad.timeline()).at(-1)?.kind, { timeout: 60_000 }).toBe("extrude");
  const step = await exportStep(page);
  expect(step.subarray(0, 12).toString()).toBe("ISO-10303-21");

  await test.step("импорт добавляет тело и запись в историю", async () => {
    await importStep(page, "plate.step", step);
    await expect(page.getByText("Импортировано 1 тело из «plate.step».")).toBeVisible({ timeout: 60_000 });
    await cad.install();

    const entry = (await cad.timeline()).at(-1)!;
    expect(entry).toMatchObject({ kind: "import", label: "Импорт 1", status: "ok" });
    expect(entry.params).toMatchObject({ engine: "browser_wasm", file_name: "plate.step", body_index: 0, body_count: 1 });
    expect(await cad.visibleBodyCount()).toBe(2);
    expect((await cad.topology()).openEdges).toBe(0);
  });

  await test.step("импортированное тело переживает перезагрузку и участвует в экспорте", async () => {
    await page.reload();
    await expectEditorOpen(page);
    await page.waitForTimeout(4000);
    await cad.install();

    expect(await cad.visibleBodyCount()).toBe(2);
    expect((await exportStep(page)).length).toBeGreaterThan(step.length);
  });

  await test.step("файл с двумя телами даёт две записи, отмена убирает обе", async () => {
    const pair = await exportStep(page);
    await importStep(page, "pair.stp", pair);
    await expect(page.getByText("Импортировано 2 тела из «pair.stp».")).toBeVisible({ timeout: 60_000 });
    await cad.install();
    expect(await cad.visibleBodyCount()).toBe(4);
    expect((await cad.timeline()).slice(-2).map((entry) => entry.label)).toEqual(["Импорт 2", "Импорт 3"]);

    await page.getByRole("button", { name: "Отменить", exact: true }).first().click();
    await page.waitForTimeout(2500);
    await cad.install();
    expect(await cad.visibleBodyCount()).toBe(2);
  });

  await test.step("битый и чужой файл объясняют отказ", async () => {
    await importStep(page, "broken.step", Buffer.from("это не STEP"));
    await expect(page.getByText(/Не удалось прочитать STEP-файл/)).toBeVisible({ timeout: 30_000 });
    await importStep(page, "empty.step", Buffer.alloc(0));
    await expect(page.getByText(/Файл пуст/)).toBeVisible();
    await importStep(page, "model.stl", Buffer.from("solid"));
    await expect(page.getByText(/Нужен STEP/)).toBeVisible();
    await cad.install();
    expect(await cad.visibleBodyCount()).toBe(2);
  });

  expect(pageErrors).toEqual([]);
});
