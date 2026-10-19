import { test, expect, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { errorCode, type Feature, type Topo } from "./helpers/control";

const email = process.env.E2E_USER_EMAIL || "e2e-agent@example.com";
const password = process.env.E2E_USER_PASSWORD || "testpass123";

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1600, height: 1000 } });

interface SavedEntity {
  type: string;
  radius?: number;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

async function openSketch(page: Page): Promise<{ projectId: string; token: string }> {
  const login = await page.request.post("/api/auth/token", {
    form: { grant_type: "password", username: email, password },
  });
  expect(login.ok()).toBeTruthy();
  const { access_token } = await login.json();
  const created = await page.request.post("/api/projects/", {
    headers: { Authorization: `Bearer ${access_token}` },
    data: { name: `e2e-fillet-trim-${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const projectId = (await created.json()).id;

  await page.goto(`/editor/${projectId}`);
  await page.getByTestId("ribbon-sketch").dispatchEvent("click");
  const viewport = page.locator("canvas").first();
  const box = (await viewport.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 40);
  await expect(page.getByTestId("sketch-tool-fillet")).toBeVisible();
  return { projectId, token: access_token };
}

async function savedEntities(page: Page, projectId: string, token: string): Promise<{ entities: SavedEntity[]; constraints: { type: string }[] }> {
  const headers = { Authorization: `Bearer ${token}` };
  const doc = await (await page.request.get(`/api/projects/${projectId}/document`, { headers })).json();
  const components: Record<string, object> = doc.components ?? doc.document?.components ?? {};
  const sketchId = Object.entries(components).find(([, v]) => v && "plane" in v && "entities" in v)?.[0];
  return (await page.request.get(`/api/projects/${projectId}/sketches/${sketchId}`, { headers })).json();
}

async function canvasPoint(page: Page, x: number, y: number) {
  const box = (await page.locator("canvas").last().boundingBox())!;
  return { x: box.x + x, y: box.y + y };
}

async function clickAt(page: Page, x: number, y: number) {
  const p = await canvasPoint(page, x, y);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.click(p.x, p.y);
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await canvasPoint(page, ...from);
  const b = await canvasPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

test("скругление угла прямоугольника и усечение линии до пересечения", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const { projectId, token } = await openSketch(page);

  await page.getByTestId("sketch-tool-rectangle").click();
  await drag(page, [250, 220], [450, 380]);
  await page.getByTestId("sketch-tool-line").click();
  await drag(page, [350, 150], [350, 300]);

  await page.getByTestId("sketch-tool-fillet").click();
  await clickAt(page, 450, 380);
  const radius = page.getByPlaceholder("Радиус скругления");
  await expect(radius).toBeFocused();
  await radius.fill("10");
  await page.keyboard.press("Enter");
  await expect(radius).toBeHidden();

  await page.getByTestId("sketch-tool-trim").click();
  await clickAt(page, 350, 170);
  await page.screenshot({ path: test.info().outputPath("sketch.png") });

  const put = page.waitForResponse((r) => r.url().includes("/sketches/") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "ОК", exact: true }).click();
  expect((await put).ok()).toBeTruthy();

  const data = await savedEntities(page, projectId, token);
  const arcs = data.entities.filter((e) => e.type === "arc");
  expect(arcs.map((a) => a.radius)).toEqual([expect.closeTo(10, 3)]);
  expect(data.constraints.filter((c) => c.type === "tangent")).toHaveLength(2);
  const lines = data.entities.filter((e) => e.type === "line");
  expect(lines).toHaveLength(5);
  const verticals = lines.filter((l) => Math.abs(l.start!.x - l.end!.x) < 1e-6).sort((a, b) => a.start!.x - b.start!.x);
  expect(verticals).toHaveLength(3);
  const crossing = verticals[1];
  const top = Math.max(...lines.filter((l) => Math.abs(l.start!.y - l.end!.y) < 1e-6).map((l) => l.start!.y));
  expect(Math.max(crossing!.start!.y, crossing!.end!.y)).toBeCloseTo(top, 3);
  expect(pageErrors).toEqual([]);
});

interface SketchState {
  entities: (SavedEntity & { id: string; center?: { x: number; y: number } })[];
  constraints: { id: string; type: string; anchors: { entity_id: string }[] }[];
}

test("через канал управления: скругление всех углов, правка радиуса и выдавливание", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const cad = await CadEditor.open(page, "e2e-sketch-fillet-control");
  await cad.startSketchOnBasePlane();
  await cad.addSketchEntities([
    { id: "b", type: "line", start: { x: 0, y: 0 }, end: { x: 40, y: 0 } },
    { id: "r", type: "line", start: { x: 40, y: 0 }, end: { x: 40, y: 20 } },
    { id: "t", type: "line", start: { x: 40, y: 20 }, end: { x: 0, y: 20 } },
    { id: "l", type: "line", start: { x: 0, y: 20 }, end: { x: 0, y: 0 } },
  ]);
  const arcIds: string[] = [];
  for (const lines of [["b", "r"], ["r", "t"], ["t", "l"], ["l", "b"]]) {
    arcIds.push((await cad.control<{ arcId: string }>("sketch.fillet", { lines, radius: 4 })).arcId);
  }
  expect(await errorCode(cad, "sketch.fillet", { lines: ["b", "t"], radius: 2 })).toBe("operation_failed");

  const state = await cad.control<SketchState>("sketch.get");
  const radius = state.constraints.find((c) => c.type === "radius" && c.anchors[0].entity_id === arcIds[0])!;
  const solved = await cad.control<{ residual: number; entities: SketchState["entities"] }>("sketch.setConstraintValue", {
    constraintId: radius.id,
    value: 7,
  });
  expect(solved.residual).toBeLessThan(0.01);
  const arc = solved.entities.find((e) => e.id === arcIds[0])!;
  expect(arc.radius).toBeCloseTo(7, 2);
  expect(arc.center!.x).toBeCloseTo(33, 2);
  expect(arc.center!.y).toBeCloseTo(7, 2);

  const { sketchId } = await cad.control<{ sketchId: string }>("sketch.finish");
  const extruded = await cad.control<Feature>("extrude", { sketchId, distance: 10 });
  const topo = await cad.control<Topo>("topology", { bodyId: extruded.feature.bodyId });
  expect(topo.faces.filter((f) => !f.planar)).toHaveLength(4);
  expect(topo.faces).toHaveLength(10);
  expect(pageErrors).toEqual([]);
});
