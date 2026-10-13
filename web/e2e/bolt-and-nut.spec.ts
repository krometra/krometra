import { expect, test } from "@playwright/test";
import { CadEditor, edgesAtZ } from "./helpers/cad";
import { hexagon, hexTip } from "./helpers/hexagon";

/**
 * Сквозной сценарий крепёжной пары: болт М10 и гайка под него.
 *
 *   болт:  шестигранная головка (прямыми линиями) → стержень Ø10 приклеен
 *          сверху → внешняя резьба шагом 1.5 на боку стержня
 *   гайка: шестигранная заготовка → сквозное отверстие Ø10 → внутренняя
 *          резьба тем же шагом
 *
 * Шестигранника среди инструментов эскиза нет, поэтому головка и гайка
 * рисуются линиями по вершинам правильного шестиугольника.
 *
 * Сторона резьбы (внешняя или внутренняя) нигде в тесте не задаётся: её
 * определяет ориентация выбранной грани на сервере. Проверяем именно это —
 * на стержне резьба режет внутрь (габарит не растёт), в отверстии наружу
 * (отверстие расширяется), и болт с гайкой остаются совместимой парой.
 */

// Свой логин через page.request: переиспользование refresh-cookie из
// storageState параллельно с другими спеками ловит replay-защиту.
test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const PITCH = 1.5;
const SHAFT_R = 5; // резьба М10
const HEAD_AF = 17; // размер «под ключ», мм

// Головка строится симметрично относительно XY: нижняя грань, лежащая ровно
// в базовой плоскости, перехватывает клики хелпером этой плоскости
// (ROADMAP, «Живой прогон 16.08.2026»).
const HEAD_H = 7;
const HEAD_TOP_Z = HEAD_H / 2;
const HEAD_BOTTOM_Z = -HEAD_H / 2;

const SHAFT_LEN = 26;
const SHAFT_TOP_Z = HEAD_TOP_Z + SHAFT_LEN;
const THREAD_LEN = 18;

const NUT_H = 8;
const NUT_TOP_Z = NUT_H / 2;
const NUT_BOTTOM_Z = -NUT_H / 2;

/** Радиальный габарит тела в плоскости XY. */
function radialExtent(bbox: { min: number[]; max: number[] }): number {
  return Math.max(
    Math.abs(bbox.min[0]),
    Math.abs(bbox.min[1]),
    Math.abs(bbox.max[0]),
    Math.abs(bbox.max[1]),
  );
}

const HEX_TIP = hexTip(HEAD_AF);

const TOP_VIEW = [60, 60, 150];
const TOP_SPOTS: [number, number, number][] = [
  [3, 3, HEAD_TOP_Z],
  [4, 1, HEAD_TOP_Z],
  [1, 4, HEAD_TOP_Z],
];

test("болт: шестигранная головка → стержень → внешняя резьба", async ({ page }) => {
  test.setTimeout(12 * 60_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-bolt");

  // ── 1. Головка: шестиугольник прямыми линиями, выдавливание симметрично ──
  await cad.startSketchOnBasePlane();
  await cad.drawPolygon(hexagon(HEAD_AF));

  const drawn = (await cad.sketchEntities()).filter(
    (e) => e.type === "line" && !e.construction,
  );
  expect(drawn, "шестиугольник — шесть отрезков").toHaveLength(6);

  await cad.finishSketch();
  await cad.extrude({ distance: HEAD_H, direction: "symmetric" });

  let topo = await cad.topology();
  expect(topo.faces, "шестигранная призма: 6 боков + верх + низ").toBe(8);
  expect(topo.bbox.max[2] - topo.bbox.min[2]).toBeCloseTo(HEAD_H, 1);
  expect(radialExtent(topo.bbox), "габарит головки по вершинам").toBeCloseTo(HEX_TIP, 1);

  // ── 2. Стержень: круг на верхней грани головки, приклеиваем 26 мм ───────
  await cad.startSketchOnFace(TOP_VIEW, TOP_SPOTS);
  await cad.drawCircle(0, 0, SHAFT_R);
  await cad.finishSketch();
  await cad.extrude({ distance: SHAFT_LEN, operation: "join", direction: "one_side" });

  topo = await cad.topology();
  expect(await cad.visibleBodyCount(), "болт — одно тело").toBe(1);
  expect(topo.bbox.max[2], "стержень вырос вверх от головки").toBeCloseTo(SHAFT_TOP_Z, 1);
  expect(radialExtent(topo.bbox), "габарит по-прежнему задаёт головка").toBeCloseTo(HEX_TIP, 1);

  const beforeThread = topo;

  // ── 3. Внешняя резьба на боку стержня ──────────────────────────────────
  // Кликаем в точку на самой цилиндрической поверхности; сторону резьбы
  // тест не задаёт — её выбирает ориентация грани на сервере.
  await cad.thread({
    camera: [90, 0, SHAFT_TOP_Z - 6],
    spot: [SHAFT_R, 0, SHAFT_TOP_Z - 8],
    pitch: PITCH,
    length: THREAD_LEN,
  });

  topo = await cad.topology();

  const threadEntry = (await cad.timeline()).find((t) => t.kind === "thread");
  expect(threadEntry?.status, "резьба построилась").toBe("ok");
  expect(threadEntry?.params.kind, "на стержне резьба внешняя").toBe("external");
  expect(threadEntry?.params.pitch).toBeCloseTo(PITCH, 2);

  // Внешняя резьба режет материал внутрь: габарит тела не меняется
  expect(radialExtent(topo.bbox), "резьба не раздула стержень").toBeCloseTo(
    radialExtent(beforeThread.bbox),
    1,
  );
  expect(topo.bbox.max[2], "высота болта прежняя").toBeCloseTo(SHAFT_TOP_Z, 1);

  // Витки — это новые грани на месте одной гладкой цилиндрической
  expect(topo.faces, "резьба добавила грани витков").toBeGreaterThan(beforeThread.faces);
  expect(topo.openEdges, "тело осталось замкнутым").toBe(0);
  expect(await cad.visibleBodyCount(), "болт остался одним телом").toBe(1);
  expect(pageErrors).toEqual([]);
});

test("гайка: шестигранная заготовка → сквозное отверстие → внутренняя резьба", async ({
  page,
}) => {
  test.setTimeout(12 * 60_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-nut");

  // ── 1. Заготовка: шестиугольник прямыми линиями ─────────────────────────
  await cad.startSketchOnBasePlane();
  await cad.drawPolygon(hexagon(HEAD_AF));
  await cad.finishSketch();
  await cad.extrude({ distance: NUT_H, direction: "symmetric" });

  let topo = await cad.topology();
  expect(topo.faces, "шестигранная призма").toBe(8);
  expect(topo.bbox.max[2] - topo.bbox.min[2]).toBeCloseTo(NUT_H, 1);

  // ── 2. Сквозное отверстие Ø10 ──────────────────────────────────────────
  await cad.startSketchOnFace(
    [60, 60, 150],
    [
      [3, 3, NUT_TOP_Z],
      [4, 1, NUT_TOP_Z],
      [1, 4, NUT_TOP_Z],
    ],
  );
  await cad.drawCircle(0, 0, SHAFT_R);
  await cad.finishSketch();
  await cad.extrude({ distance: NUT_H, operation: "cut", direction: "one_side" });

  topo = await cad.topology();
  expect(await cad.visibleBodyCount(), "гайка — одно тело").toBe(1);
  expect(topo.faces, "6 боков + верх + низ + стенка отверстия").toBe(9);

  // Отверстие сквозное: кромки видны и сверху, и снизу
  const holeRim = (z: number) =>
    edgesAtZ(topo, z).filter(
      (e) => Math.hypot(e.a[0], e.a[1]) < SHAFT_R + 0.6 && Math.hypot(e.b[0], e.b[1]) < SHAFT_R + 0.6,
    );
  expect(holeRim(NUT_TOP_Z), "кромка отверстия сверху").not.toHaveLength(0);
  expect(holeRim(NUT_BOTTOM_Z), "кромка отверстия снизу").not.toHaveLength(0);

  const beforeThread = topo;

  // ── 3. Внутренняя резьба на стенке отверстия ───────────────────────────
  // Смотрим в отверстие сверху сбоку и кликаем по дальней стенке: ближняя
  // к камере половина стенки не видна из-за самой гайки.
  await cad.thread({
    camera: [26, 0, 46],
    spot: [-SHAFT_R, 0, 0],
    pitch: PITCH,
  });

  topo = await cad.topology();

  const threadEntry = (await cad.timeline()).find((t) => t.kind === "thread");
  expect(threadEntry?.status, "резьба построилась").toBe("ok");
  expect(threadEntry?.params.kind, "в отверстии резьба внутренняя").toBe("internal");

  // Внутренняя резьба режет наружу от оси, поэтому наружный габарит гайки
  // не меняется, а стенка отверстия отступает — иначе болт не завернётся.
  expect(radialExtent(topo.bbox), "наружный габарит гайки прежний").toBeCloseTo(
    radialExtent(beforeThread.bbox),
    1,
  );
  expect(topo.bbox.max[2] - topo.bbox.min[2], "высота гайки прежняя").toBeCloseTo(NUT_H, 1);
  expect(topo.faces, "резьба добавила грани витков").toBeGreaterThan(beforeThread.faces);
  expect(topo.openEdges, "тело осталось замкнутым").toBe(0);
  expect(await cad.visibleBodyCount(), "гайка осталась одним телом").toBe(1);
  expect(pageErrors).toEqual([]);
});

test("резьба отказывается строиться на плоской грани и объясняет причину", async ({ page }) => {
  test.setTimeout(6 * 60_000);

  const cad = await CadEditor.open(page, "e2e-thread-errors");

  await cad.startSketchOnBasePlane();
  await cad.drawPolygon(hexagon(HEAD_AF));
  await cad.finishSketch();
  await cad.extrude({ distance: HEAD_H, direction: "symmetric" });

  // Верхняя грань головки плоская — резьбу на ней нарезать нельзя, и
  // пользователь должен увидеть почему, а не молчащую кнопку.
  await cad.threadRejectedFace(TOP_VIEW, [3, 3, HEAD_TOP_Z], /цилиндрической грани/i);

  const timeline = await cad.timeline();
  expect(
    timeline.filter((t) => t.kind === "thread"),
    "неудачная резьба не попала в дерево",
  ).toEqual([]);
});


test("крупная резьба банки: широкий паз в несколько заходов", async ({ page }) => {
  test.setTimeout(12 * 60_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-jar-thread");

  // Горлышко банки: цилиндр Ø40, стенка снаружи
  const NECK_R = 20;
  const NECK_H = 30;
  const NECK_TOP_Z = NECK_H / 2;

  await cad.startSketchOnBasePlane();
  await cad.drawCircle(0, 0, NECK_R);
  await cad.finishSketch();
  await cad.extrude({ distance: NECK_H, direction: "symmetric" });

  let topo = await cad.topology();
  expect(topo.faces, "цилиндр: бок + два торца").toBe(3);
  const before = topo;

  // Пресет «Банка»: крупный шаг, широкий паз, два захода.
  // Именно то, чего не даёт метрическая резьба — тонкая канавка на банке
  // бессмысленна, крышка по ней не поедет.
  await cad.thread({
    camera: [90, 0, 10],
    spot: [NECK_R, 0, NECK_TOP_Z - 8],
    preset: "jar",
    length: 20,
  });

  topo = await cad.topology();
  const entry = (await cad.timeline()).find((t) => t.kind === "thread");
  expect(entry?.status, "крупная резьба построилась").toBe("ok");
  expect(entry?.params.kind).toBe("external");
  expect(entry?.params.starts, "два захода").toBe(2);
  expect(Number(entry?.params.pitch), "крупный шаг").toBeGreaterThanOrEqual(6);

  // Паз широкий и глубокий, но режет строго внутрь: габарит горлышка прежний
  expect(radialExtent(topo.bbox), "резьба не раздула горлышко").toBeCloseTo(
    radialExtent(before.bbox),
    1,
  );
  expect(topo.faces, "витки добавили граней").toBeGreaterThan(before.faces);
  expect(topo.openEdges, "тело осталось замкнутым").toBe(0);
  expect(await cad.visibleBodyCount()).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("панель резьбы: пресеты и ручные параметры дают разный результат", async ({ page }) => {
  test.setTimeout(12 * 60_000);

  const cad = await CadEditor.open(page, "e2e-thread-params");

  const R = 12;
  const H = 30;
  await cad.startSketchOnBasePlane();
  await cad.drawCircle(0, 0, R);
  await cad.finishSketch();
  await cad.extrude({ distance: H, direction: "symmetric" });

  const camera = [70, 0, 8];
  const spot: [number, number, number] = [R, 0, 6];

  // Левая резьба с ручными параметрами: проверяем, что панель доносит
  // до ядра и профиль, и направление навивки.
  await cad.thread({
    camera,
    spot,
    pitch: 5,
    depthPercent: 30,
    crestPercent: 50,
    starts: 2,
    length: 18,
    leftHanded: true,
  });

  const entry = (await cad.timeline()).find((t) => t.kind === "thread");
  expect(entry?.status).toBe("ok");
  expect(Number(entry?.params.pitch)).toBeCloseTo(5, 1);
  expect(Number(entry?.params.crest_ratio), "профиль — широкий паз").toBeCloseTo(0.5, 1);
  expect(entry?.params.starts).toBe(2);
  expect(entry?.params.right_handed, "левая навивка").toBe(false);
  // Глубина задана долей шага: 0.3 × 5 мм
  expect(Number(entry?.params.depth)).toBeCloseTo(1.5, 1);

  const topo = await cad.topology();
  expect(topo.openEdges, "тело замкнуто").toBe(0);
  expect(radialExtent(topo.bbox), "габарит не вырос").toBeCloseTo(R, 1);
});


test("отмена резьбы возвращает гладкий стержень без перезагрузки страницы", async ({ page }) => {
  test.setTimeout(10 * 60_000);

  const cad = await CadEditor.open(page, "e2e-thread-undo");

  const R = 10;
  await cad.startSketchOnBasePlane();
  await cad.drawCircle(0, 0, R);
  await cad.finishSketch();
  await cad.extrude({ distance: 30, direction: "symmetric" });

  const smooth = await cad.topology();
  expect(smooth.faces, "гладкий цилиндр: бок и два торца").toBe(3);

  await cad.thread({
    camera: [70, 0, 8],
    spot: [R, 0, 6],
    pitch: 2,
    length: 18,
  });

  const threaded = await cad.topology();
  expect(threaded.faces, "резьба добавила грани").toBeGreaterThan(smooth.faces);
  expect((await cad.timeline()).filter((t) => t.kind === "thread")).toHaveLength(1);

  // Приёмка мутирующей операции: результат исчезает из сцены сразу,
  // без перезагрузки страницы (AGENTS.md, «3D Viewport»).
  await page.getByTestId("ribbon-undo").dispatchEvent("click");
  await expect
    .poll(async () => (await cad.topology()).faces, { timeout: 60000 })
    .toBe(smooth.faces);

  expect(
    (await cad.timeline()).filter((t) => t.kind === "thread"),
    "запись резьбы ушла из дерева",
  ).toHaveLength(0);
  expect(await cad.visibleBodyCount(), "тело осталось одно").toBe(1);
});
