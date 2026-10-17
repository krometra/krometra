import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

interface Point {
  x: number;
  y: number;
}

interface Line {
  id: string;
  type: string;
  start: Point;
  end: Point;
}

interface SketchSnapshot {
  entities: Line[];
  constraints: { id: string; type: string }[];
}

type Side = "bottom" | "top" | "left" | "right";

function side(lines: Line[], which: Side): Line {
  const horizontal = (l: Line) => Math.abs(l.start.y - l.end.y) < 1e-6;
  const midX = (l: Line) => (l.start.x + l.end.x) / 2;
  const midY = (l: Line) => (l.start.y + l.end.y) / 2;
  const pick = (list: Line[], key: (l: Line) => number, max: boolean) =>
    list.reduce((a, b) => ((max ? key(b) > key(a) : key(b) < key(a)) ? b : a));
  if (which === "bottom") return pick(lines.filter(horizontal), midY, false);
  if (which === "top") return pick(lines.filter(horizontal), midY, true);
  if (which === "left") return pick(lines.filter((l) => !horizontal(l)), midX, false);
  return pick(lines.filter((l) => !horizontal(l)), midX, true);
}

function maxEndpointGap(lines: Line[]): number {
  const ends = lines.flatMap((l) => [l.start, l.end]);
  return Math.max(
    ...ends.map((p) => Math.min(...ends.filter((q) => q !== p).map((q) => Math.hypot(p.x - q.x, p.y - q.y)))),
  );
}

test("два прямоугольника: размеры и отступ не разрывают углы, превью и выдавливание работают", async ({ page }) => {
  test.setTimeout(180_000);
  const cad = await CadEditor.open(page, "rect-dimension-closure");
  await cad.startSketchOnBasePlane();
  await cad.drawRect(0, 0, 20, 15);
  await cad.drawRect(40, 5, 18, 12);

  const initial = await cad.control<SketchSnapshot>("sketch.get");
  const lines = initial.entities.filter((e) => e.type === "line");
  expect(lines).toHaveLength(8);
  const leftRect = lines.filter((l) => Math.max(l.start.x, l.end.x) < 30);
  const rightRect = lines.filter((l) => Math.min(l.start.x, l.end.x) > 30);
  const a = { bottom: side(leftRect, "bottom"), left: side(leftRect, "left"), right: side(leftRect, "right") };
  const b = { bottom: side(rightRect, "bottom"), left: side(rightRect, "left") };

  const add = (type: string, anchors: { entityId: string; point?: number }[], value: number) =>
    cad.control<{ constraintId: string; residual: number }>("sketch.addConstraint", { type, anchors, value });

  const width = await add("length", [{ entityId: a.bottom.id }], 20);
  await add("length", [{ entityId: a.left.id }], 15);
  await add("length", [{ entityId: b.bottom.id }], 18);
  await add("length", [{ entityId: b.left.id }], 12);
  const bottomA = a.bottom.start.x < a.bottom.end.x ? 1 : 0;
  const bottomB = b.bottom.start.x < b.bottom.end.x ? 0 : 1;
  const gap = await add("horizontal_distance", [{ entityId: a.bottom.id, point: bottomA }, { entityId: b.bottom.id, point: bottomB }], 20);

  for (const value of [25, 31]) {
    await cad.control("sketch.setConstraintValue", { constraintId: width.constraintId, value });
  }
  await cad.control("sketch.setConstraintValue", { constraintId: gap.constraintId, value: 25 });
  await page.waitForTimeout(400);
  for (let i = 0; i < 14; i++) {
    const { pixelsPerMm } = await cad.control<{ pixelsPerMm: number }>("sketch.project", { points: [] });
    if (pixelsPerMm >= 9) break;
    const [sx, sy] = await cad.sketchPoint([40, 8]);
    await page.mouse.move(sx, sy);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(160);
  }
  await page.screenshot({ path: test.info().outputPath("sketch-dimensions.png") });

  const solved = await cad.control<SketchSnapshot>("sketch.get");
  const solvedLines = solved.entities.filter((e) => e.type === "line");
  expect(maxEndpointGap(solvedLines)).toBeLessThan(1e-4);

  await cad.finishSketch();
  await cad.click("Выдавить");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toBeVisible();
  await page.locator('input[type="text"]').first().fill("31");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("extrude-error")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("extrude-preview.png") });
  await page.getByTestId("extrude-apply").dispatchEvent("click");
  await expect(page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toHaveCount(0, { timeout: 60_000 });
  await cad.idle();

  const bodies = await cad.visibleBodyIds();
  expect(bodies.length).toBeGreaterThan(0);
  const measured = await cad.control<{ items: { volume: number }[] }>("measure", {
    targets: bodies.map((bodyId) => ({ bodyId })),
  });
  const volume = measured.items.reduce((sum, item) => sum + item.volume, 0);
  expect(Math.abs(volume - (31 * 15 + 18 * 12) * 31)).toBeLessThan(5);
});
