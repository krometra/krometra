import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import { near, rect, type Feature, type Topo } from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

interface Capture {
  dataBase64: string;
  width: number;
  height: number;
}

interface Projection {
  points: { x: number; y: number; inside: boolean }[];
  canvas: { left: number; top: number; width: number; height: number };
}

const MIN_FACE_CONTRAST = 8;
const BACKGROUND_LUMA = 238;

async function meanLuma(page: Page, capture: Capture, spots: [number, number][], radius = 6): Promise<number[]> {
  return page.evaluate(
    async ({ dataBase64, spots, radius }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${dataBase64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return spots.map(([x, y]) => {
        const { data } = context.getImageData(Math.round(x) - radius, Math.round(y) - radius, radius * 2 + 1, radius * 2 + 1);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        return sum / (data.length / 4);
      });
    },
    { dataBase64: capture.dataBase64, spots, radius },
  );
}

async function faceBrightness(cad: CadEditor, points: number[][]): Promise<number[]> {
  const projection = await cad.control<Projection>("viewport.project", { points });
  expect(projection.points.every((point) => point.inside), "точки граней в кадре").toBe(true);
  const capture = await cad.control<Capture>("viewport.capture");
  const scale = capture.width / projection.canvas.width;
  const spots = projection.points.map((point): [number, number] => [
    (point.x - projection.canvas.left) * scale,
    (point.y - projection.canvas.top) * scale,
  ]);
  return meanLuma(cad.page, capture, spots);
}

function expectDistinct(shades: number[], label: string) {
  for (const shade of shades) expect(shade, `${label}: точка на теле, а не на фоне`).toBeLessThan(BACKGROUND_LUMA);
  for (let i = 0; i < shades.length; i++) {
    for (let j = i + 1; j < shades.length; j++) {
      expect(Math.abs(shades[i] - shades[j]), `${label}: грани ${i} и ${j} различаются по яркости (${shades.map(Math.round).join(", ")})`)
        .toBeGreaterThanOrEqual(MIN_FACE_CONTRAST);
    }
  }
}

test("три видимые грани бруска с фаской освещены по-разному с любого изометрического ракурса", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-viewport-lighting");
  const base = await cad.control<{ sketchId: string }>("sketch.create", { plane: "XY", entities: [rect(-20, -15, 20, 15)] });
  const block = await cad.control<Feature>("extrude", { sketchId: base.sketchId, distance: 20 });
  const topo = await cad.control<Topo>("topology", { bodyId: block.feature.bodyId });
  const topRight = topo.edges.find(
    (edge) => !edge.closed && near(edge.start[0], 20) && near(edge.end[0], 20) && near(edge.start[2], 20) && near(edge.end[2], 20),
  );
  expect(topRight, "верхнее ребро грани +X").toBeTruthy();
  await cad.control<Feature>("chamfer", { bodyId: block.feature.bodyId, edgeIds: [topRight!.id], distance: 3 });
  await cad.idle();
  await cad.control("viewport.setHelpers", { grid: false });

  await cad.camera([90, -90, 80], [0, 0, 10]);
  await page.waitForTimeout(500);
  expectDistinct(await faceBrightness(cad, [[-8, 0, 20], [20, 0, 8], [0, -15, 8]]), "вид спереди-справа");

  await cad.camera([-90, 90, 70], [0, 0, 10]);
  await page.waitForTimeout(500);
  expectDistinct(await faceBrightness(cad, [[0, 0, 20], [-20, 0, 8], [0, 15, 8]]), "вид сзади-слева");

  await cad.camera([90, 90, 60], [0, 0, 10]);
  await page.waitForTimeout(500);
  expectDistinct(await faceBrightness(cad, [[-8, 0, 20], [20, 5, 8], [0, 15, 8]]), "вид сзади-справа");

  expect(pageErrors).toEqual([]);
});
