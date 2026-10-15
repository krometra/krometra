import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

interface Point {
  x: number;
  y: number;
}

interface SketchSnapshot {
  entities: { id: string; type: string; start?: Point; end?: Point; center?: Point; radius?: number; startAngle?: number; endAngle?: number }[];
  constraints: { type: string; anchors: { entity_id: string; sub_index: number }[] }[];
}

const sketchUi = (page: Page) => page.locator("[data-sketch-ui]");
const sketchButton = (page: Page, name: string) => sketchUi(page).getByRole("button", { name, exact: true });

async function sketchState(cad: CadEditor): Promise<SketchSnapshot> {
  return cad.control<SketchSnapshot>("sketch.get");
}

async function zoomTo(cad: CadEditor, pixelsPerMm: number) {
  for (let i = 0; i < 14; i++) {
    const { pixelsPerMm: current } = await cad.control<{ pixelsPerMm: number }>("sketch.project", { points: [] });
    if (current >= pixelsPerMm) return;
    const [cx, cy] = await cad.sketchCanvasCenter();
    await cad.page.mouse.move(cx, cy);
    await cad.page.mouse.wheel(0, -240);
    await cad.page.waitForTimeout(160);
  }
}

async function hoverAt(cad: CadEditor, point: [number, number]) {
  const [sx, sy] = await cad.sketchPoint(point);
  await cad.page.mouse.move(sx, sy);
  await cad.page.waitForTimeout(130);
  return [sx, sy] as const;
}

async function clickAt(cad: CadEditor, point: [number, number]) {
  const [sx, sy] = await hoverAt(cad, point);
  await cad.page.mouse.click(sx, sy);
  await cad.page.waitForTimeout(560);
}

const lineLength = (e: SketchSnapshot["entities"][number]) => Math.hypot(e.end!.x - e.start!.x, e.end!.y - e.start!.y);
const midpoint = (e: SketchSnapshot["entities"][number]): [number, number] => [
  (e.start!.x + e.end!.x) / 2,
  (e.start!.y + e.end!.y) / 2,
];

test("дуга по трём точкам: подсказка на прямой, Esc отменяет шаг, профиль выдавливается", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-sketch-arc3");
  await cad.startSketchOnBasePlane();
  await zoomTo(cad, 4);

  await sketchButton(page, "Дуга 3т").click();
  await expect(page.getByText("Дуга по 3 точкам: укажите начало")).toBeVisible();

  await clickAt(cad, [-40, 0]);
  await expect(page.getByText("Укажите конец дуги")).toBeVisible();
  await clickAt(cad, [40, 0]);
  await expect(page.getByText("Укажите точку на дуге")).toBeVisible();

  await hoverAt(cad, [10, 0]);
  await expect(page.getByText("Точки на одной прямой: дугу не построить")).toBeVisible();
  await clickAt(cad, [10, 0]);
  expect((await sketchState(cad)).entities.filter((e) => e.type === "arc"), "на прямой дуга не строится").toHaveLength(0);

  await clickAt(cad, [0, 30]);
  const [arc] = (await sketchState(cad)).entities.filter((e) => e.type === "arc");
  expect(arc, "дуга построена").toBeDefined();
  expect(arc.radius!).toBeCloseTo(125 / 3, 0);
  expect(arc.center!.y).toBeCloseTo(-35 / 3, 0);
  expect(arc.endAngle! - arc.startAngle!).toBeCloseTo(Math.PI - 2 * Math.atan2(35 / 3, 40), 1);

  await clickAt(cad, [-40, -40]);
  await expect(page.getByText("Укажите конец дуги")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Дуга по 3 точкам: укажите начало")).toBeVisible();
  await clickAt(cad, [40, -40]);
  await clickAt(cad, [-40, -40]);
  await page.keyboard.press("Escape");
  expect((await sketchState(cad)).entities, "Esc не оставил лишних объектов").toHaveLength(1);

  await sketchButton(page, "Линия").click();
  await clickAt(cad, [40, 0]);
  await clickAt(cad, [-40, 0]);
  expect((await sketchState(cad)).entities).toHaveLength(2);

  await cad.finishSketch();
  await cad.extrude({ distance: 10 });
  const topo = await cad.topology();
  expect(topo.faces, "торцы, плоская стенка и цилиндрическая").toBe(4);
  expect(topo.bbox.max[0] - topo.bbox.min[0]).toBeCloseTo(80, 0);
  expect(topo.bbox.max[1] - topo.bbox.min[1]).toBeCloseTo(30, 0);
  expect(pageErrors).toEqual([]);
});

test("ограничение на три отрезка: цепочка равенств, по вертикали на каждый, отмена одним шагом", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-sketch-multi-constraint");
  await cad.startSketchOnBasePlane();
  await zoomTo(cad, 4);

  await sketchButton(page, "Линия").click();
  const segments: [number, number][][] = [
    [[-60, -20], [-40, 5]],
    [[-15, -20], [0, 20]],
    [[25, -20], [50, -10]],
  ];
  for (const [from, to] of segments) {
    await clickAt(cad, from);
    await clickAt(cad, to);
  }
  const lines = (await sketchState(cad)).entities.filter((e) => e.type === "line");
  expect(lines).toHaveLength(3);

  async function selectAll() {
    await sketchButton(page, "Выбор").click();
    const current = (await sketchState(cad)).entities.filter((e) => e.type === "line");
    for (const line of current) await clickAt(cad, midpoint(line));
    await expect(page.getByText("Выбрано: 3")).toBeVisible();
  }

  await selectAll();
  const perpendicular = sketchButton(page, "⊥");
  await expect(perpendicular, "перпендикулярность для трёх не определена").toBeDisabled();
  await expect(perpendicular).toHaveAttribute("title", /только для двух отрезков, выбрано 3/);
  await expect(sketchButton(page, "↔")).toBeDisabled();
  await expect(sketchButton(page, "R")).toBeDisabled();
  await expect(sketchButton(page, "=")).toBeEnabled();

  await sketchButton(page, "=").click();
  await expect.poll(async () => (await sketchState(cad)).constraints.filter((c) => c.type === "equal").length).toBe(2);
  await expect
    .poll(async () => {
      const lengths = (await sketchState(cad)).entities.filter((e) => e.type === "line").map(lineLength);
      return Math.max(...lengths) - Math.min(...lengths);
    }, { message: "длины выровнены решателем" })
    .toBeLessThan(0.5);

  await sketchButton(page, "Отменить").click();
  await expect.poll(async () => (await sketchState(cad)).constraints.length, { message: "одна отмена снимает оба равенства" }).toBe(0);
  await sketchButton(page, "Повторить").click();
  await expect.poll(async () => (await sketchState(cad)).constraints.length).toBe(2);

  await selectAll();
  await sketchButton(page, "Вер").click();
  await expect.poll(async () => (await sketchState(cad)).constraints.filter((c) => c.type === "vertical").length).toBe(3);
  await expect
    .poll(async () => {
      const current = (await sketchState(cad)).entities.filter((e) => e.type === "line");
      return Math.max(...current.map((e) => Math.abs(e.end!.x - e.start!.x)));
    }, { message: "все три отрезка вертикальны" })
    .toBeLessThan(0.5);

  expect(pageErrors).toEqual([]);
});
