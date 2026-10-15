import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { circle, readStl, rect, type ExportedFile, type Feature } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const ROD_NAME = "Стержень";

async function saveDownload(page: Page, trigger: () => Promise<void>) {
  const [file] = await Promise.all([page.waitForEvent("download"), trigger()]);
  return { name: file.suggestedFilename(), bytes: readFileSync((await file.path())!) };
}

async function openBodyMenu(page: Page, name: string) {
  await page.getByTitle("Двойной клик — переименовать, правый — меню").filter({ hasText: name }).first().click({ button: "right" });
}

async function estimatedTriangles(page: Page): Promise<number> {
  const estimate = page.getByTestId("mesh-export-estimate");
  await expect(estimate).toContainText(/Треугольников: \d/, { timeout: 30_000 });
  const match = (await estimate.innerText()).match(/Треугольников: ([\d\s ]+)/);
  return Number(match![1].replace(/[\s ]/g, ""));
}

test("экспорт тела из дерева, качество сетки STL и 3MF", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-export-quality");
  const rodSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [circle(0, 0, 10)] });
  const rod = await cad.control<Feature>("extrude", { sketchId: rodSketch.sketchId, distance: 20 });
  await cad.control("body.rename", { bodyId: rod.feature.bodyId, name: ROD_NAME });
  const boxSketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(20, 0, 40, 20)] });
  await cad.control<Feature>("extrude", { sketchId: boxSketch.sketchId, distance: 10 });

  await test.step("канал: пресеты качества и 3MF", async () => {
    const draft = readStl(await cad.control<ExportedFile>("export", { format: "stl", bodyIds: [rod.feature.bodyId], quality: "draft" }));
    const high = readStl(await cad.control<ExportedFile>("export", { format: "stl", bodyIds: [rod.feature.bodyId], quality: "high" }));
    expect(draft.triangles).toBeLessThan(high.triangles);
    const custom = readStl(await cad.control<ExportedFile>("export", { format: "stl", bodyIds: [rod.feature.bodyId], tolerance: 0.5, angleDeg: 45 }));
    expect(custom.triangles).toBeLessThanOrEqual(draft.triangles);
    const threeMf = await cad.control<ExportedFile>("export", { format: "3mf" });
    expect(threeMf.mime).toBe("model/3mf");
    expect(threeMf.filename).toMatch(/\.3mf$/);
    expect(Buffer.from(threeMf.dataBase64, "base64").subarray(0, 2).toString()).toBe("PK");
    expect((await cad.request("export", { format: "stl", tolerance: 0 })).ok).toBe(false);
  });

  await test.step("дерево: экспорт STEP одного тела называется по телу", async () => {
    await openBodyMenu(page, ROD_NAME);
    const step = await saveDownload(page, () => page.getByRole("menuitem", { name: "Экспорт STEP" }).click());
    expect(step.name).toBe(`${ROD_NAME}.step`);
    expect(step.bytes.subarray(0, 12).toString()).toBe("ISO-10303-21");
  });

  let draftTriangles = 0;
  await test.step("дерево: STL с черновым качеством, оценка совпадает с файлом", async () => {
    await openBodyMenu(page, ROD_NAME);
    await page.getByRole("menuitem", { name: "Экспорт STL…" }).click();
    const dialog = page.getByTestId("mesh-export-dialog");
    await expect(dialog).toContainText(ROD_NAME);
    await page.getByRole("tab", { name: "Черновое" }).click();
    draftTriangles = await estimatedTriangles(page);
    const stl = await saveDownload(page, () => page.getByRole("button", { name: "Скачать STL" }).click());
    expect(stl.name).toBe(`${ROD_NAME}.stl`);
    expect(stl.bytes.readUInt32LE(80)).toBe(draftTriangles);
    expect(stl.bytes.length).toBe(84 + draftTriangles * 50);
  });

  await test.step("выбор качества переживает перезагрузку, своё качество проверяется", async () => {
    await page.reload();
    await cad.install();
    await page.getByRole("button", { name: /Экспорт/ }).click();
    await page.getByText("STL (.stl)…").click();
    await expect(page.getByRole("tab", { name: "Черновое" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Своё" }).click();
    for (const [label, value] of [["Линейный допуск", "0.002"], ["Угловой допуск", "5"]]) {
      await page.getByLabel(label).fill(value);
      await page.getByLabel(label).blur();
    }
    expect(await estimatedTriangles(page)).toBeGreaterThan(draftTriangles);
    await page.getByRole("dialog").getByRole("button", { name: "Отмена" }).click();
    await expect(page.getByTestId("mesh-export-dialog")).toBeHidden();
  });

  await test.step("меню экспорта: 3MF всех видимых тел", async () => {
    await page.getByRole("button", { name: /Экспорт/ }).click();
    await page.getByText("3MF (.3mf)…").click();
    await expect(page.getByTestId("mesh-export-dialog")).toContainText("Все видимые тела");
    await estimatedTriangles(page);
    const file = await saveDownload(page, () => page.getByRole("button", { name: "Скачать 3MF" }).click());
    expect(file.name).toMatch(/\.3mf$/);
    expect(file.bytes.subarray(0, 2).toString()).toBe("PK");
  });

  expect(pageErrors).toEqual([]);
});
