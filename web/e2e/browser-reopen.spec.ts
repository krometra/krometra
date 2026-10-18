import { expect, test } from "@playwright/test";
import { CadEditor, expectEditorOpen } from "./helpers/cad";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const SIDE = 50;
const HEIGHT = 12;
const TOP_Z = HEIGHT / 2;
const TOP_VIEW = [70, 70, 140];
const TOP_SPOTS: [number, number, number][] = [
  [18, -18, TOP_Z],
  [20, -14, TOP_Z],
  [14, -20, TOP_Z],
];

test("проект восстанавливает browser B-rep после повторного открытия", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  const cad = await CadEditor.open(page, "e2e-browser-reopen");
  await cad.startSketchOnBasePlane();
  await cad.drawRect(-SIDE / 2, -SIDE / 2, SIDE, SIDE);
  await cad.finishSketch();
  await cad.extrude({ distance: HEIGHT, direction: "symmetric" });

  const before = await cad.topology();
  expect(before.openEdges).toBe(0);
  expect(before.bbox.max[2] - before.bbox.min[2]).toBeCloseTo(HEIGHT, 3);
  expect((await cad.timeline()).at(-1)?.params.engine).toBe("browser_wasm");

  const documentResponse = await page.request.get(`/api/projects/${cad.projectId}/document`, {
    headers: cad.authHeader,
  });
  expect(documentResponse.ok()).toBeTruthy();
  const document = await documentResponse.json();
  expect(document.components[before.bodyId].source.kind).toBe("browser_extrude");

  const stepResponse = await page.request.get(
    `/api/projects/${cad.projectId}/geometry/${before.bodyId}/browser-step`,
    { headers: cad.authHeader },
  );
  expect(stepResponse.ok(), "сохранённый B-rep в формате STEP").toBeTruthy();
  expect((await stepResponse.body()).subarray(0, 13).toString()).toBe("ISO-10303-21;");

  const namingResponse = await page.request.get(
    `/api/projects/${cad.projectId}/geometry/${before.bodyId}/browser-naming`,
    { headers: cad.authHeader },
  );
  expect(namingResponse.ok(), "сохранённая таблица имён граней").toBeTruthy();
  const naming = await namingResponse.json();
  expect(naming.faces.length).toBeGreaterThan(0);
  expect(naming.faces.every((face: { name: string }) => face.name.startsWith("f-"))).toBe(true);

  await page.goto("about:blank");
  await page.goto(`/editor/${cad.projectId}`);
  await expectEditorOpen(page);
  await cad.install();
  await expect.poll(() => cad.visibleBodyCount(), {
    message: "меш восстановленного тела виден во вьюпорте",
    timeout: 60_000,
  }).toBe(1);

  const after = await cad.topology();
  expect(after.bodyId).toBe(before.bodyId);
  expect(after.bbox).toEqual(before.bbox);
  expect(after.openEdges).toBe(0);
  expect(after.edges.map((edge) => edge.id).sort()).toEqual(before.edges.map((edge) => edge.id).sort());

  await cad.startSketchOnFace(TOP_VIEW, TOP_SPOTS);
  await cad.drawCircle(15, 15, 4);
  await cad.finishSketch();
  await cad.extrude({ distance: 3, operation: "cut" });

  await expect.poll(async () => (await cad.timeline()).at(-1)?.params.operation, {
    timeout: 60_000,
  }).toBe("cut");
  expect((await cad.timeline()).at(-1)?.params.engine).toBe("browser_wasm");
  expect(await cad.visibleBodyCount()).toBe(1);
  const cut = await cad.topology();
  expect(cut.bodyId).not.toBe(before.bodyId);
  expect(cut.openEdges).toBe(0);
  expect(cut.zLevels).toContain(TOP_Z - 3);
  expect(pageErrors).toEqual([]);
});
