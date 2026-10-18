import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { CadEditor, expectEditorOpen } from "./helpers/cad";
import { hexagon } from "./helpers/hexagon";

/**
 * Не тест, а витрина README: строит болт M10 (как bolt-and-nut.spec.ts),
 * снимает скриншоты редактора и записывает гифку вращающегося болта.
 * Запуск: E2E_SHOTS=1 npx playwright test e2e/readme-shots.spec.ts
 * Скриншоты — в .docs/media/ (README_SHOTS_DIR), гифка — в docs/assets/bolt.gif (README_GIF).
 * Кадры гифки кладутся в GIF_FRAMES_DIR (по умолчанию — в test-results).
 */

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1600, height: 950 },
  deviceScaleFactor: 2,
});

const SHOTS = process.env.README_SHOTS_DIR ?? "../.docs/media";
const GIF = process.env.README_GIF ?? "../docs/assets/bolt.gif";
const GIF_FRAMES = 72;
const GIF_FPS = 20;
const GIF_SIZE = [800, 500];

const THREAD = { camera: [90, 0, 23.5], spot: [5, 0, 21.5] as [number, number, number], pitch: 1.5, length: 18 };

async function openNamedProject(page: Page, name: string): Promise<CadEditor> {
  const cad = await CadEditor.open(page, "readme");
  const renamed = await page.request.patch(`/api/projects/${cad.projectId}`, {
    headers: cad.authHeader,
    data: { name },
  });
  expect(renamed.ok(), "переименование проекта").toBeTruthy();
  await page.reload();
  await expectEditorOpen(page);
  await cad.install();
  return cad;
}

async function hideHint(page: Page): Promise<void> {
  const close = page.getByLabel("Скрыть подсказку");
  if (await close.count()) await close.first().dispatchEvent("click");
  await page.waitForTimeout(300);
}

async function zoomSketch(cad: CadEditor, steps: number): Promise<void> {
  const [x, y] = await cad.sketchCanvasCenter();
  await cad.page.mouse.move(x, y);
  for (let i = 0; i < steps; i++) {
    await cad.page.mouse.wheel(0, -120);
    await cad.page.waitForTimeout(80);
  }
  await cad.page.waitForTimeout(300);
}

async function hideSceneHelpers(cad: CadEditor): Promise<void> {
  await cad.control("viewport.setHelpers", { grid: false, sketchOutlines: false });
}

async function shot(page: Page, name: string): Promise<void> {
  await hideHint(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({ path: `${SHOTS}/${name}.png`, scale: "css" });
}

async function captureTurntableFrame(cad: CadEditor, angle: number): Promise<Buffer> {
  const target = [0, 0, 13];
  const distance = 61;
  const elevation = 0.28;
  await cad.control("camera.set", {
    position: [
      target[0] + distance * Math.cos(elevation) * Math.cos(angle),
      target[1] + distance * Math.cos(elevation) * Math.sin(angle),
      target[2] + distance * Math.sin(elevation),
    ],
    target,
  });
  await cad.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const { dataBase64 } = await cad.control<{ dataBase64: string }>("viewport.capture", {
    width: GIF_SIZE[0] * 2,
    height: GIF_SIZE[1] * 2,
  });
  return Buffer.from(dataBase64, "base64");
}

function encodeGif(frames: string): void {
  mkdirSync(dirname(GIF), { recursive: true });
  execFileSync("ffmpeg", [
    "-y",
    "-framerate",
    String(GIF_FPS),
    "-i",
    `${frames}/f%03d.png`,
    "-filter_complex",
    `scale=${GIF_SIZE[0]}:${GIF_SIZE[1]}:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a`,
    "-loop",
    "0",
    GIF,
  ]);
}

test("витрина README: болт M10", async ({ page }) => {
  test.setTimeout(600_000);
  const cad = await openNamedProject(page, "Болт M10");

  await cad.startSketchOnBasePlane();
  await cad.drawPolygon(hexagon(17));
  await zoomSketch(cad, 6);
  await shot(page, "sketcher");
  await cad.finishSketch();
  await cad.extrude({ distance: 7, direction: "symmetric" });

  await cad.startSketchOnFace(
    [60, 60, 150],
    [
      [3, 3, 3.5],
      [4, 1, 3.5],
      [1, 4, 3.5],
    ],
  );
  await cad.drawCircle(0, 0, 5);
  await cad.finishSketch();
  await cad.extrude({ distance: 26, operation: "join", direction: "one_side" });

  await cad.threadPreviewFor(THREAD);
  await page.evaluate(() => {
    let el: HTMLElement | null = document.querySelector('[data-testid="thread-panel"]');
    while (el) {
      el.scrollTop = 0;
      el = el.parentElement;
    }
  });
  await cad.camera([52, 34, 34], [0, 0, 13]);
  await shot(page, "thread");
  await cad.applyThreadPanel();

  await page.keyboard.press("Escape");
  await hideSceneHelpers(cad);
  await cad.camera([50, 38, 34], [0, 0, 13]);
  await shot(page, "editor");

  await page.keyboard.press("Escape");
  const frames = process.env.GIF_FRAMES_DIR ?? test.info().outputPath("frames");
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  for (let i = 0; i < GIF_FRAMES; i++) {
    const angle = Math.PI / 4 + (2 * Math.PI * i) / GIF_FRAMES;
    writeFileSync(`${frames}/f${String(i).padStart(3, "0")}.png`, await captureTurntableFrame(cad, angle));
  }
  encodeGif(frames);
});
