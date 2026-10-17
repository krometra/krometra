import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { errorCode, near, rect, type Feature, type Topo } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

interface PlaneInfo {
  id: string;
  name: string;
  kind: string;
  refBodyId: string | null;
  planeOffset: number;
  planeBasis: { origin: number[]; u: number[]; v: number[]; n: number[] };
  sketchIds: string[];
}

interface PlaneList {
  planes: PlaneInfo[];
  planeIds: string[];
  preview: { origin: number[]; normal: number[] } | null;
}

async function box(cad: CadEditor): Promise<string> {
  const sketch = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(0, 0, 20, 10)] });
  return (await cad.control<Feature>("extrude", { sketchId: sketch.sketchId, distance: 10 })).feature.bodyId;
}

async function planes(cad: CadEditor): Promise<PlaneList> {
  return cad.control<PlaneList>("plane.list");
}

async function bodyBox(cad: CadEditor, bodyId: string) {
  return (await cad.control<Topo>("topology", { bodyId })).bbox;
}

async function bottomOf(cad: CadEditor, bodyId: string): Promise<number> {
  const reply = await cad.request("topology", { bodyId });
  return reply.ok ? (reply.result as Topo).bbox.min[2] : Number.NaN;
}

async function topFace(cad: CadEditor, bodyId: string): Promise<string> {
  return (await cad.control<{ faces: { id: string }[] }>("face.find", { bodyId, normal: [0, 0, 1] })).faces[0].id;
}

test("плоскость из ленты: смещение от грани, эскиз кликом по плоскости, правка из дерева и пересборка", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-work-plane-ui");
  const source = await box(cad);

  await cad.camera([10, -40, 50], [10, 5, 5]);
  await page.getByTestId("ribbon-plane").dispatchEvent("click");
  await expect(page.getByTestId("work-plane-panel")).toBeVisible();
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("plane");

  await page.getByTestId("work-plane-ref-face").dispatchEvent("click");
  const [x, y] = await cad.projectPoint([10, 5, 10]);
  await page.mouse.click(x, y);
  await page.getByTestId("work-plane-distance").locator("input").fill("5");
  await expect.poll(async () => (await planes(cad)).preview?.origin[2], { message: "призрак над торцом на 5 мм" }).toBeCloseTo(15, 3);
  expect((await planes(cad)).planes, "призрак ничего не создаёт").toEqual([]);

  await page.getByTestId("work-plane-apply").dispatchEvent("click");
  await expect(page.getByTestId("work-plane-panel")).toHaveCount(0, { timeout: 60_000 });
  await cad.idle();
  const [plane] = (await planes(cad)).planes;
  expect(plane).toMatchObject({ kind: "offset", refBodyId: source, name: "Плоскость 1" });
  expect(plane.planeOffset).toBeCloseTo(15, 6);
  expect((await planes(cad)).preview, "призрак снят").toBeNull();
  await expect(page.getByTestId("work-plane-row")).toHaveText(/Плоскость 1/);

  await cad.camera([10, 5, 90], [10, 5, 0]);
  await page.getByTestId("ribbon-sketch").dispatchEvent("click");
  const [px, py] = await cad.projectPoint([10, 13.5, 15]);
  await page.mouse.click(px, py);
  await expect.poll(async () => (await cad.control<{ refPlaneId: string | null }>("sketch.get")).refPlaneId, { message: "эскиз открыт на плоскости" }).toBe(plane.id);
  await cad.control("sketch.addEntities", { entities: [rect(2, 2, 6, 6)] });
  const sketch = await cad.control<{ sketchId: string }>("sketch.finish");
  const boss = (await cad.control<Feature>("extrude", { sketchId: sketch.sketchId, distance: 3 })).feature.bodyId;
  expect((await bodyBox(cad, boss)).min[2]).toBeCloseTo(15, 3);

  await page.getByTestId("work-plane-row").click({ button: "right" });
  await page.getByText("Изменить параметры").click();
  await expect(page.getByTestId("work-plane-panel")).toBeVisible();
  await page.getByTestId("work-plane-distance").locator("input").fill("8");
  await page.getByTestId("work-plane-apply").dispatchEvent("click");
  await expect.poll(() => bottomOf(cad, boss), { message: "бобышка переехала с плоскостью", timeout: 60_000 }).toBeCloseTo(18, 3);

  await expect(page.getByTestId("work-plane-panel")).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId("timeline-node").filter({ hasText: "Выдавить 1" }).click();
  await page.locator('aside [inputmode="decimal"]').first().fill("30");
  await expect.poll(() => bottomOf(cad, boss), { message: "плоскость поднялась с торцом коробки", timeout: 60_000 }).toBeCloseTo(38, 3);
  await expect.poll(async () => (await planes(cad)).planes[0].planeOffset, { message: "плоскость в документе пересчитана" }).toBeCloseTo(38, 3);

  await cad.control("history.undo");
  await expect.poll(() => bottomOf(cad, boss), { message: "отмена правки высоты" }).toBeCloseTo(18, 3);
  await cad.control("history.undo");
  await expect.poll(() => bottomOf(cad, boss), { message: "отмена правки плоскости" }).toBeCloseTo(15, 3);

  await page.getByTestId("work-plane-visibility").click();
  await expect.poll(async () => (await planes(cad)).planeIds, { message: "скрытая плоскость пропала из сцены" }).toEqual([]);
  await page.getByTestId("work-plane-visibility").click();
  await expect.poll(async () => (await planes(cad)).planeIds).toEqual([plane.id]);

  await page.getByTestId("work-plane-row").click({ button: "right" });
  await page.getByText("Удалить", { exact: true }).click();
  await expect(page.getByTestId("work-plane-delete-dialog")).toBeVisible();
  await page.getByTestId("work-plane-delete-confirm").dispatchEvent("click");
  await expect.poll(async () => (await planes(cad)).planes.length).toBe(0);
  await expect.poll(() => bottomOf(cad, boss), { message: "эскиз остался на месте" }).toBeCloseTo(15, 3);

  expect(pageErrors).toEqual([]);
});

test("канал: плоскость под углом, по трём точкам, посередине, эскиз planeId и отказы", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-work-plane-channel");
  const source = await box(cad);
  const topo = await cad.control<Topo>("topology", { bodyId: source });
  const topFront = topo.edges.find((edge) => near(edge.start[2], 10) && near(edge.end[2], 10) && near(edge.start[1], 0) && near(edge.end[1], 0));
  expect(topFront, "верхнее переднее ребро").toBeTruthy();

  const tilted = await cad.control<PlaneInfo>("plane.create", { kind: "angle", bodyId: source, edgeId: topFront!.id, plane: "XY", angle: 90 });
  expect(Math.abs(tilted.planeBasis.n[1])).toBeCloseTo(1, 6);
  expect(tilted.refBodyId).toBe(source);

  const lifted = await cad.control<PlaneInfo>("plane.create", { kind: "offset", plane: "XY", distance: 40 });
  expect(lifted.refBodyId).toBeNull();
  expect(lifted.planeOffset).toBeCloseTo(40, 6);
  const sketch = await cad.control<{ sketchId: string }>("sketch.create", { planeId: lifted.id, entities: [rect(0, 0, 4, 4)] });
  const pad = (await cad.control<Feature>("extrude", { sketchId: sketch.sketchId, distance: 2 })).feature.bodyId;
  expect((await bodyBox(cad, pad)).min[2]).toBeCloseTo(40, 3);
  await cad.control("plane.update", { planeId: lifted.id, kind: "offset", plane: "XY", distance: 50 });
  await expect.poll(() => bottomOf(cad, pad), { message: "тело от эскиза на плоскости пересобрано" }).toBeCloseTo(50, 3);
  await cad.control("history.undo");
  await expect.poll(() => bottomOf(cad, pad), { message: "отмена правки плоскости" }).toBeCloseTo(40, 3);

  const three = await cad.control<PlaneInfo>("plane.create", { kind: "three_points", bodyId: source, points: [{ vertex: [0, 0, 10] }, { vertex: [20, 0, 10] }, { vertex: [0, 10, 0] }] });
  expect(Math.abs(three.planeBasis.n[2])).toBeGreaterThan(0.5);

  const top = await topFace(cad, source);
  const bottom = (await cad.control<{ faces: { id: string }[] }>("face.find", { bodyId: source, normal: [0, 0, -1] })).faces[0].id;
  const middle = await cad.control<PlaneInfo>("plane.create", { kind: "midplane", bodyId: source, faceIds: [top, bottom] });
  expect(middle.planeOffset).toBeCloseTo(5, 6);

  expect(await errorCode(cad, "plane.create", { kind: "angle", plane: "XY" }), "без оси").toBe("invalid_params");
  expect(await errorCode(cad, "plane.create", { kind: "midplane", bodyId: source, faceIds: [top, topo.faces.find((face) => face.normal && near(face.normal[0], 1))!.id] }), "непараллельные грани").toBe("operation_failed");
  expect(await errorCode(cad, "plane.update", { planeId: "plane-none", kind: "offset" }), "чужая плоскость").toBe("not_found");
  expect(await errorCode(cad, "sketch.create", { planeId: lifted.id, plane: "XY", entities: [rect(0, 0, 1, 1)] }), "две опоры").toBe("invalid_params");

  const removed = await cad.control<{ detachedSketchIds: string[] }>("plane.delete", { planeId: lifted.id });
  expect(removed.detachedSketchIds).toEqual([sketch.sketchId]);
  expect((await planes(cad)).planes.map((plane) => plane.id)).not.toContain(lifted.id);
  await cad.control("history.undo");
  await expect.poll(async () => (await planes(cad)).planes.find((plane) => plane.id === lifted.id)?.sketchIds).toEqual([sketch.sketchId]);

  expect(pageErrors).toEqual([]);
});
