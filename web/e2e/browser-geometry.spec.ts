import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const PLATE = 50;
const THICK = 10;
const TOP_Z = THICK / 2;
const HOLE_R = 6;
const TOP_VIEW = [45, 45, 110];
const TOP_SPOTS: [number, number, number][] = [
  [18, -18, TOP_Z],
  [20, -14, TOP_Z],
  [14, -20, TOP_Z],
];

async function lastEntry(cad: CadEditor, kind = "extrude") {
  await expect.poll(async () => (await cad.timeline()).at(-1)?.kind, { timeout: 60_000 }).toBe(kind);
  await cad.page.waitForTimeout(1500);
  await cad.install();
  return (await cad.timeline()).at(-1)!;
}

function rectangle(id: string, x: number, y: number, size: number) {
  return { id, type: "rectangle", corner1: { x, y }, corner2: { x: x + size, y: y + size } };
}

async function clickModelUndo(page: Page) {
  await page.getByRole("button", { name: "Отменить", exact: true }).first().click();
  await page.waitForTimeout(2500);
}

async function download(page: Page, label: RegExp, confirm?: string) {
  await page.getByRole("button", { name: /Экспорт/ }).click();
  const choose = async () => {
    await page.getByText(label).click();
    if (confirm) await page.getByRole("button", { name: confirm }).click();
  };
  const [file] = await Promise.all([page.waitForEvent("download"), choose()]);
  const path = await file.path();
  const { readFileSync } = await import("node:fs");
  return { name: file.suggestedFilename(), bytes: readFileSync(path!) };
}

test("браузерное ядро: отверстие, вырез, приклеивание, булева операция, экспорт", async ({ page }) => {
  test.setTimeout(8 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-browser-geometry");

  await test.step("пластина с круглым отверстием одним эскизом", async () => {
    await cad.startSketchOnBasePlane();
    await cad.drawRect(-PLATE / 2, -PLATE / 2, PLATE, PLATE);
    await cad.drawCircle(0, 0, HOLE_R);
    await cad.finishSketch();
    await cad.extrude({ distance: THICK, direction: "symmetric" });

    expect((await lastEntry(cad)).params.engine).toBe("browser_wasm");
    const topo = await cad.topology();
    expect(topo.openEdges).toBe(0);
    expect(topo.bbox.max[2] - topo.bbox.min[2]).toBeCloseTo(THICK, 3);
    expect(topo.faces, "шесть граней пластины + стенка отверстия").toBeGreaterThanOrEqual(7);
  });

  await test.step("вырез в browser-тело", async () => {
    await cad.startSketchOnFace(TOP_VIEW, TOP_SPOTS);
    await cad.drawCircle(15, 15, 4);
    await cad.finishSketch();
    await cad.extrude({ distance: 3, operation: "cut" });

    const entry = await lastEntry(cad);
    expect(entry.params).toMatchObject({ operation: "cut", engine: "browser_wasm" });
    expect(await cad.visibleBodyCount()).toBe(1);
    const topo = await cad.topology();
    expect(topo.openEdges).toBe(0);
    expect(topo.zLevels).toContain(TOP_Z - 3);
  });

  await test.step("приклеивание и отмена", async () => {
    await cad.startSketchOnFace(TOP_VIEW, TOP_SPOTS);
    await cad.addSketchEntities([rectangle("boss", -20, -20, 10)]);
    await cad.finishSketch();
    await cad.extrude({ distance: 4, operation: "join" });

    expect((await lastEntry(cad)).params).toMatchObject({ operation: "join", engine: "browser_wasm" });
    expect(await cad.visibleBodyCount()).toBe(1);
    expect((await cad.topology()).bbox.max[2]).toBeCloseTo(TOP_Z + 4, 3);

    await clickModelUndo(page);
    await cad.install();
    expect(await cad.visibleBodyCount()).toBe(1);
    expect((await cad.topology()).bbox.max[2]).toBeCloseTo(TOP_Z, 3);
  });

  await test.step("после перезагрузки тела восстанавливаются в worker", async () => {
    await page.reload();
    await expect(page.getByText("БРАУЗЕР МОДЕЛИ")).toBeVisible();
    await page.waitForTimeout(4000);
    await cad.install();

    await cad.startSketchOnFace(TOP_VIEW, TOP_SPOTS);
    await cad.addSketchEntities([rectangle("boss", -20, -20, 10)]);
    await cad.finishSketch();
    await cad.extrude({ distance: 4, operation: "join" });
    expect((await lastEntry(cad)).params.operation).toBe("join");
    expect((await cad.topology()).bbox.max[2]).toBeCloseTo(TOP_Z + 4, 3);
  });

  await test.step("паз из отрезков и дуг — новое тело", async () => {
    await cad.startSketchOnFace(TOP_VIEW, TOP_SPOTS);
    await cad.addSketchEntities([
      { id: "slot-top", type: "line", start: { x: 20, y: 5 }, end: { x: 40, y: 5 } },
      { id: "slot-right", type: "arc", center: { x: 40, y: 0 }, radius: 5, startAngle: -Math.PI / 2, endAngle: Math.PI / 2 },
      { id: "slot-bottom", type: "line", start: { x: 40, y: -5 }, end: { x: 20, y: -5 } },
      { id: "slot-left", type: "arc", center: { x: 20, y: 0 }, radius: 5, startAngle: Math.PI / 2, endAngle: 3 * Math.PI / 2 },
    ]);
    await cad.finishSketch();
    await cad.extrude({ distance: 10, operation: "new_body", direction: "symmetric" });

    expect((await lastEntry(cad)).params).toMatchObject({ operation: "new_body", engine: "browser_wasm" });
    expect(await cad.visibleBodyCount()).toBe(2);
  });

  await test.step("булево вычитание паза из пластины и отмена", async () => {
    const doc = await (await page.request.get(`/api/projects/${cad.projectId}/document`, { headers: cad.authHeader })).json();
    const visible = Object.entries(doc.components as Record<string, any>)
      .filter(([, c]) => c.type === "body" && c.visible !== false)
      .map(([id, c]) => ({ id, kind: c.source.kind as string, operation: c.source.operation as string }));
    const plate = visible.find((b) => b.operation === "join")!;
    const slot = visible.find((b) => b.operation === "new_body")!;

    await page.getByTestId("ribbon-boolean").click();
    await page.locator(`[data-tree-body="${plate.id}"]`).click();
    await page.locator(`[data-tree-body="${slot.id}"]`).click();
    await page.getByTestId("boolean-op-subtract").click();
    await page.getByTestId("boolean-apply").click();
    await expect(page.getByTestId("boolean-apply")).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2500);
    await cad.install();

    const entry = await lastEntry(cad, "boolean");
    expect(entry.params.engine).toBe("browser_wasm");
    expect(await cad.visibleBodyCount()).toBe(1);
    const topo = await cad.topology();
    expect(topo.openEdges).toBe(0);
    expect(topo.bbox.max[0]).toBeCloseTo(PLATE / 2, 3);

    await page.getByRole("button", { name: "Закрыть" }).click();
    await clickModelUndo(page);
    await cad.install();
    expect(await cad.visibleBodyCount()).toBe(2);
    await page.getByRole("button", { name: /Повторить|Вернуть/ }).first().click();
    await page.waitForTimeout(2500);
    await cad.install();
    expect(await cad.visibleBodyCount()).toBe(1);
  });

  await test.step("экспорт STEP и STL из worker", async () => {
    const step = await download(page, /STEP \(\.step\)/);
    expect(step.name).toMatch(/\.step$/);
    expect(step.bytes.subarray(0, 13).toString()).toBe("ISO-10303-21;");

    const stl = await download(page, /STL \(\.stl\)/, "Скачать STL");
    expect(stl.name).toMatch(/\.stl$/);
    const triangles = stl.bytes.readUInt32LE(80);
    expect(triangles).toBeGreaterThan(20);
    expect(stl.bytes.length).toBe(84 + triangles * 50);
  });

  expect(pageErrors).toEqual([]);
});
