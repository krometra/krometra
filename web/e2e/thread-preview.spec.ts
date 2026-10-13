import { expect, test } from "@playwright/test";
import { CadEditor } from "./helpers/cad";

/**
 * Призрак резьбы: витки видно в сцене до вычитания на сервере.
 *
 * Резьба режется секундами, поэтому параметры нельзя подбирать «применил —
 * посмотрел — отменил». Панель рисует будущие витки сама, по оси и радиусу
 * выбранной грани, и они обязаны следовать за полями без единого запроса на
 * построение.
 */

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const R = 12;
const H = 30;
const CAMERA = [70, 0, 8];
const SPOT: [number, number, number] = [R, 0, 6];

async function cylinderProject(page: Parameters<typeof CadEditor.open>[0], name: string) {
  const cad = await CadEditor.open(page, name);
  await cad.startSketchOnBasePlane();
  await cad.drawCircle(0, 0, R);
  await cad.finishSketch();
  await cad.extrude({ distance: H, direction: "symmetric" });
  return cad;
}

test("призрак резьбы появляется до применения и следует за параметрами", async ({ page }) => {
  test.setTimeout(12 * 60_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await cylinderProject(page, "e2e-thread-preview");
  const before = await cad.topology();

  // Метрическая: одна нитка, канавка утоплена в стержень.
  const metric = await cad.threadPreviewFor({
    camera: CAMERA,
    spot: SPOT,
    preset: "m-std",
  });
  expect(metric, "призрак резьбы построился").not.toBeNull();
  expect(metric!.starts, "у метрической резьбы один заход").toBe(1);
  expect(metric!.threads, "нитка на заход").toBe(1);
  expect(metric!.pitch).toBeCloseTo(1.5, 2);
  expect(metric!.external, "на стержне резьба внешняя").toBe(true);
  expect(metric!.depth, "глубина профиля меньше радиуса стержня").toBeLessThan(R);

  // Пресет «Банка»: два захода и крупный шаг — призрак это показывает сразу.
  await cad.setThreadFields({ preset: "jar" });
  const jar = await cad.threadGhost();
  expect(jar!.starts, "у банки два захода").toBe(2);
  expect(jar!.threads, "две нитки в сцене").toBe(2);
  expect(jar!.pitch, "крупный шаг").toBeGreaterThanOrEqual(6);
  expect(jar!.depth, "паз банки глубже метрической канавки").toBeGreaterThan(metric!.depth);

  // Правка одного поля руками, без пресета: призрак обязан следовать за
  // числом так же, как призрак скругления следует за радиусом — ради этого
  // предпросмотр и делался.
  await cad.setThreadFields({ pitch: 2 });
  const retuned = await cad.threadGhost();
  expect(retuned!.pitch, "шаг призрака взят из поля").toBeCloseTo(2, 2);
  expect(retuned!.starts, "правка шага не тронула число заходов").toBe(jar!.starts);

  // Пока показывали призрак, тело не менялось: ни одного построения на сервере.
  const timeline = await cad.timeline();
  expect(timeline.filter((t) => t.kind === "thread"), "призрак ничего не строит").toEqual([]);
  const during = await cad.topology();
  expect(during.faces, "геометрия тела не тронута").toBe(before.faces);

  // Закрыли панель — призрак убран, мусор в сцене не остался.
  await cad.closeThreadPanel();
  expect(await cad.threadGhost(), "призрак снят вместе с панелью").toBeNull();

  expect(pageErrors).toEqual([]);
});

test("призрак стоит там, где потом окажется настоящая резьба", async ({ page }) => {
  test.setTimeout(12 * 60_000);

  /**
   * Главное свойство предпросмотра — честность. Призрак, нарисованный не там,
   * где пройдёт рез, хуже его отсутствия: по нему подбирают параметры.
   * Сравниваем габарит призрака с зоной, которую реально изменила операция.
   */
  const cad = await cylinderProject(page, "e2e-thread-preview-truth");

  const THREAD_LEN = 12;
  const OFFSET = 4;
  const ghost = await cad.threadPreviewFor({
    camera: CAMERA,
    spot: SPOT,
    preset: "m-std",
    pitch: 3,
    length: THREAD_LEN,
    offset: OFFSET,
  });
  expect(ghost).not.toBeNull();

  // Тело симметрично относительно XY, грань идёт от z=-15; отступ и длина
  // отсчитываются от начала грани.
  const faceStart = -H / 2;
  const expectedBottom = faceStart + OFFSET;
  const expectedTop = expectedBottom + THREAD_LEN;

  // Резьба занимает ровно свой участок грани: свес клина ядро обрезает по
  // этим границам, иначе витки лезут за торец (на болте — по шляпке).
  // Профиль занимает шаг, поэтому допускаем пол-шага на скос крайнего витка.
  // Профиль центрирован на своём кольце, поэтому крайние витки выступают на
  // пол-шага — но не на подъём за оборот, как было до обрезки свеса.
  const halfPitch = 3 / 2;
  expect(ghost!.bbox.min[2], "призрак начинается у отступа").toBeCloseTo(
    expectedBottom - halfPitch,
    0,
  );
  expect(ghost!.bbox.max[2], "призрак кончается через длину резьбы").toBeCloseTo(
    expectedTop + halfPitch,
    0,
  );
  expect(
    ghost!.bbox.max[2] - ghost!.bbox.min[2],
    "призрак не длиннее заданной резьбы плюс скосы крайних витков",
  ).toBeLessThanOrEqual(THREAD_LEN + 2 * halfPitch + 0.01);
  // Виток сидит верхом на поверхности: наружу выступает половина профиля,
  // остальное утоплено в тело. Габарит призрака не должен уходить от грани
  // дальше этой половины — иначе он висит в стороне от детали.
  const ghostRadius = Math.max(...ghost!.bbox.max.slice(0, 2));
  const metricDepth = 3 * 0.61;
  expect(ghostRadius, "призрак обнимает грань, а не висит в стороне").toBeGreaterThan(R - 0.1);
  expect(ghostRadius, "призрак не раздувает деталь").toBeLessThan(R + metricDepth);

  const before = await cad.topology();
  await cad.applyThreadPanel();
  const after = await cad.topology();

  // Резьба режет только свой участок: торцы тела остались на месте, а новые
  // уровни по Z появились именно там, где стоял призрак.
  expect(after.bbox.min[2], "низ тела не тронут").toBeCloseTo(before.bbox.min[2], 1);
  expect(after.bbox.max[2], "верх тела не тронут").toBeCloseTo(before.bbox.max[2], 1);

  // Число витков призрака и настоящей резьбы должно совпадать: именно по нему
  // пользователь судит, поместится ли резьба на деталь.
  const expectedTurns = Math.floor(THREAD_LEN / 3);
  expect(expectedTurns).toBeGreaterThan(1);

  const cutLevels = after.zLevels.filter((z) => !before.zLevels.some((b) => Math.abs(b - z) < 0.01));
  expect(cutLevels.length, "рез добавил новые уровни по Z").toBeGreaterThan(0);
  expect(Math.min(...cutLevels), "рез начался не раньше призрака").toBeGreaterThanOrEqual(
    ghost!.bbox.min[2] - 0.5,
  );
  expect(Math.max(...cutLevels), "рез кончился не позже призрака").toBeLessThanOrEqual(
    ghost!.bbox.max[2] + 0.5,
  );
});

test("вращение сцены не сбрасывает выбранную грань и призрак", async ({ page }) => {
  test.setTimeout(12 * 60_000);

  /**
   * Резьбу разглядывают со всех сторон — именно ради этого и нужен призрак.
   * Раньше вращение заканчивалось событием click, и протяжка мимо тела
   * снимала выделение грани вместе с призраком.
   */
  const cad = await cylinderProject(page, "e2e-thread-preview-orbit");

  const before = await cad.threadPreviewFor({ camera: CAMERA, spot: SPOT, preset: "m-std" });
  expect(before, "призрак построился до вращения").not.toBeNull();

  await cad.orbitDrag(140, 50);

  const after = await cad.threadGhost();
  expect(after, "призрак пережил вращение сцены").not.toBeNull();
  expect(after!.starts).toBe(before!.starts);
  expect(after!.pitch).toBeCloseTo(before!.pitch, 3);
  // Призрак живёт в координатах модели: вращение камеры его не двигает.
  expect(after!.bbox.min[2]).toBeCloseTo(before!.bbox.min[2], 3);

  await expect(page.getByTestId("thread-apply"), "грань осталась выбранной").toBeEnabled();
});

test("призрак резьбы исчезает после применения, уступая настоящим виткам", async ({ page }) => {
  test.setTimeout(12 * 60_000);

  const cad = await cylinderProject(page, "e2e-thread-preview-apply");
  const before = await cad.topology();

  await cad.thread({ camera: CAMERA, spot: SPOT, preset: "m-std", length: 20 });

  const entry = (await cad.timeline()).find((t) => t.kind === "thread");
  expect(entry?.status, "резьба построилась").toBe("ok");
  const after = await cad.topology();
  expect(after.faces, "витки добавили граней").toBeGreaterThan(before.faces);
  expect(await cad.threadGhost(), "призрак не остался поверх готовой резьбы").toBeNull();
  expect(after.openEdges, "тело осталось замкнутым").toBe(0);
});

test("уход из редактора с открытой панелью резьбы не роняет страницу", async ({ page }) => {
  test.setTimeout(12 * 60_000);

  /**
   * Призрак живёт вне реестра тел, поэтому при размонтировании вьюпорта его
   * никто не убирал: геометрия и материалы оставались в GPU-памяти. В CAD
   * такие утечки накапливаются за сессию, а обращение к уже освобождённой
   * сцене роняет страницу.
   */
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const cad = await cylinderProject(page, "e2e-thread-preview-unmount");
  await cad.threadPreviewFor({ camera: CAMERA, spot: SPOT, preset: "m-std" });

  await page.goto("/dashboard");
  await page.waitForTimeout(1500);

  expect(errors, "размонтирование с призраком не бросает ошибок").toEqual([]);
});
