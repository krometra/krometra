import { expect, type Page } from "@playwright/test";
import type { ControlChannel, ControlReply } from "../../src/lib/control/protocol";
import {
  candidateViews,
  clearestSpot,
  edgePickPoints,
  offsetFromEdge,
  type Edge,
  type EdgePickPlan,
  type EdgeSpot,
  type ScreenPoint,
  type ScreenRect,
} from "./edgePick";

export type { Edge } from "./edgePick";

declare global {
  interface Window {
    cadControl?: ControlChannel;
  }
}

export const E2E_EMAIL = process.env.E2E_USER_EMAIL || "e2e-agent@example.com";
export const E2E_PASSWORD = process.env.E2E_USER_PASSWORD || "testpass123";

const READY_TIMEOUT_MS = 120_000;
const IDLE_TIMEOUT_MS = 120_000;
const NOT_READY_RETRY_MS = 60_000;
const SETTLE_MS = 300;

interface Projection {
  points: (ScreenPoint & { behind: boolean; inside: boolean })[];
  canvas: ScreenRect;
}

interface SketchProjection {
  points: ScreenPoint[];
  canvas: ScreenRect;
  pixelsPerMm: number;
}

interface SketchState {
  active: boolean;
  loaded: boolean;
  plane: string | null;
  entities: any[];
}

export interface ThreadGhost {
  starts: number;
  pitch: number;
  depth: number;
  external: boolean;
  threads: number;
  bbox: { min: number[]; max: number[] };
}

export interface Topology {
  bodyId: string;
  faces: number;
  bbox: { min: number[]; max: number[] };
  edges: Edge[];
  zLevels: number[];
  /** Рёбра меша, у которых не два треугольника: у целого тела их нет. */
  openEdges: number;
}

export interface ThreadOpts {
  camera: number[];
  /** Точка на цилиндрической грани (мм) — куда кликнуть, чтобы её выбрать. */
  spot: [number, number, number];
  /** Готовый профиль из панели: m-std, trapez, jar, cap… */
  preset?: string;
  pitch?: number;
  /** Глубина профиля, % шага. */
  depthPercent?: number;
  /** Плоская вершина клина, % шага: 0 — острая, 50+ — паз банки. */
  crestPercent?: number;
  starts?: number;
  length?: number;
  offset?: number;
  leftHanded?: boolean;
}

export interface ExtrudeOpts {
  distance: number;
  operation?: "new_body" | "join" | "cut";
  direction?: "one_side" | "symmetric";
  reversed?: boolean;
}

/**
 * Драйвер редактора для «живых» сценариев моделирования.
 *
 * Кликаем настоящей мышью по канвасу, но экранные координаты считаем из сцены —
 * проецируем точку модели через живую камеру. Иначе тест был бы привязан
 * к пикселям конкретного разрешения и разваливался от любого сдвига вёрстки.
 */
export class CadEditor {
  private token = "";
  private edges: Edge[] = [];

  private constructor(
    readonly page: Page,
    readonly projectId: string,
  ) {}

  static async open(page: Page, projectName: string): Promise<CadEditor> {
    const login = await page.request.post("/api/auth/token", {
      form: { grant_type: "password", username: E2E_EMAIL, password: E2E_PASSWORD },
    });
    expect(login.ok(), "логин по password grant").toBeTruthy();
    const { access_token } = await login.json();

    const created = await page.request.post("/api/projects/", {
      headers: { Authorization: `Bearer ${access_token}` },
      data: { name: `${projectName}-${Date.now()}` },
    });
    expect(created.ok(), "создание проекта").toBeTruthy();

    const cad = new CadEditor(page, (await created.json()).id as string);
    cad.token = access_token;
    await page.goto(`/editor/${cad.projectId}`);
    await expect(page.getByText("БРАУЗЕР МОДЕЛИ")).toBeVisible({ timeout: READY_TIMEOUT_MS });
    await cad.install();
    return cad;
  }

  /** Заголовок авторизации для прямых API-вызовов из спек. */
  get authHeader() {
    return { Authorization: `Bearer ${this.token}` };
  }

  async install(): Promise<void> {
    await expect.poll(async () => {
      try {
        const reply = await this.request("state");
        return reply.ok && (reply.result as { ready: boolean }).ready;
      } catch {
        return false;
      }
    }, { message: "редактор публикует готовый cadControl", timeout: READY_TIMEOUT_MS }).toBe(true);
    await this.idle();
  }

  async request(op: string, params?: Record<string, unknown>): Promise<ControlReply> {
    return this.page.evaluate(
      (req) =>
        window.cadControl
          ? window.cadControl.request(req)
          : ({ ok: false, op: req.op, error: { code: "not_ready", message: "window.cadControl не опубликован" } } as const),
      { op, params },
    );
  }

  async control<T = any>(op: string, params?: Record<string, unknown>): Promise<T> {
    const deadline = Date.now() + NOT_READY_RETRY_MS;
    for (;;) {
      const reply = await this.request(op, params);
      if (reply.ok) return reply.result as T;
      if (reply.error.code !== "not_ready" || Date.now() > deadline) {
        throw new Error(`cadControl ${op}: ${reply.error.code} — ${reply.error.message}`);
      }
      await this.page.waitForTimeout(250);
    }
  }

  async idle(): Promise<void> {
    await expect
      .poll(
        async () => {
          const reply = await this.request("state");
          if (!reply.ok) return false;
          const state = reply.result as { ready: boolean; busy: boolean };
          return state.ready && !state.busy;
        },
        { message: "редактор готов и не занят операцией", timeout: IDLE_TIMEOUT_MS },
      )
      .toBe(true);
  }

  private async until(condition: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await condition()) return true;
      if (Date.now() > deadline) return false;
      await this.page.waitForTimeout(100);
    }
  }

  // ── Клики ─────────────────────────────────────────────────────────────
  // locator.click() в редакторе виснет на ожидании «стабильности»: сцена
  // перерисовывается каждый кадр. Бьём событием напрямую.

  async click(label: string, which: "first" | "last" = "first"): Promise<void> {
    await this.page.evaluate(
      ([text, pick]) => {
        const hits = [...document.querySelectorAll("button")].filter(
          (b) => b.textContent?.trim() === text,
        );
        const btn = pick === "last" ? hits[hits.length - 1] : hits[0];
        if (!btn) throw new Error(`Кнопка «${text}» не найдена`);
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      },
      [label, which] as const,
    );
    await this.page.waitForTimeout(400);
  }

  private async clickPrefixed(prefix: string): Promise<void> {
    await this.page.evaluate((text) => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.trim().startsWith(text),
      );
      if (!btn) throw new Error(`Кнопка «${text}…» не найдена`);
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, prefix);
    await this.page.waitForTimeout(300);
  }

  async camera(position: number[], target: number[] = [0, 0, 0]): Promise<void> {
    await this.control("camera.set", { position, target });
    await this.page.waitForTimeout(SETTLE_MS);
  }

  async cameraState(): Promise<{ position: number[]; target: number[]; up: number[] }> {
    return this.control("camera.get");
  }

  async projectPoint(point: number[]): Promise<[number, number]> {
    const { points } = await this.control<Projection>("viewport.project", { points: [point] });
    return [Math.round(points[0].x), Math.round(points[0].y)];
  }

  private async clickModelPoint(point: [number, number, number]): Promise<void> {
    const [x, y] = await this.projectPoint(point);
    await this.page.mouse.click(x, y);
  }

  async sketchPoint(point: [number, number]): Promise<[number, number]> {
    const { points } = await this.control<SketchProjection>("sketch.project", { points: [point] });
    return [Math.round(points[0].x), Math.round(points[0].y)];
  }

  private sketchState(): Promise<SketchState> {
    return this.control<SketchState>("sketch.get");
  }

  // ── Эскиз ─────────────────────────────────────────────────────────────

  /** «Эскиз» → клик по хелперу базовой плоскости XY. */
  async startSketchOnBasePlane(): Promise<void> {
    await this.click("Эскиз");
    await expect(this.page.getByText("Кликните базовую плоскость")).toBeVisible();
    // В пустом документе хелперы плоскостей всего 12×12 мм — целимся близко к
    // нулю, но в квадрант со стороны камеры: иначе луч к точке пересекает
    // квадраты XZ/YZ раньше самого XY и эскиз уходит не в ту плоскость.
    const { position } = await this.cameraState();
    const quadrant = [Math.sign(position[0]) || 1, Math.sign(position[1]) || 1];
    await this.clickModelPoint([3 * quadrant[0], 3 * quadrant[1], 0]);
    await this.until(async () => (await this.sketchState()).loaded, 10000);
    await this.page.waitForTimeout(SETTLE_MS);
    await expect(this.page.getByText("ПЛОСКОСТЬ ЭСКИЗА")).toBeVisible();
  }

  /**
   * «Эскиз» → клик по плоской грани тела.
   *
   * Хелперы базовых плоскостей накрывают тело целиком и иногда перехватывают
   * клик (особенно на грани z=0, компланарной плоскости XY), поэтому проверяем
   * привязку по линиям построения от контура грани и пробуем другие точки.
   */
  async startSketchOnFace(camera: number[], spots: [number, number, number][]): Promise<void> {
    const log: string[] = [];
    for (const spot of spots) {
      await this.camera(camera);
      await this.click("Эскиз");
      await expect(this.page.getByText("Кликните базовую плоскость")).toBeVisible();
      await this.page.waitForTimeout(400);
      await this.clickModelPoint(spot);
      await this.until(async () => (await this.sketchState()).loaded, 2500);
      await this.page.waitForTimeout(SETTLE_MS);
      const sketch = await this.sketchState();
      const state = sketch.active
        ? { construction: sketch.entities.filter((e) => e.construction).length, plane: sketch.plane }
        : { construction: -1, plane: null };
      log.push(`${spot.join(",")} → ${JSON.stringify(state)}`);
      if (state.construction > 0) return;
      // Промах: либо клик ушёл в хелпер базовой плоскости (эскиз без привязки),
      // либо вообще мимо тела — выходим из того режима, в котором оказались.
      await this.page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find((b) => {
          const t = b.textContent?.trim();
          return t === "Отмена" || t === "Отмена (Esc)";
        });
        btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await this.page.waitForTimeout(1200);
    }
    throw new Error(`Эскиз не привязался к грани ни в одной из точек: ${log.join(" | ")}`);
  }

  /**
   * Замкнутый контур линиями по вершинам.
   *
   * Шестигранника среди инструментов эскиза нет, поэтому головка болта, гайка
   * и крышка рисуются прямыми.
   *
   * Две ловушки, найденные живым прогоном:
   *  - у пустого эскиза масштаб около 1 px/мм, а инструмент линии отбрасывает
   *    отрезок короче 4 экранных пикселей. Шестигранник «под ключ 17» умещался
   *    в 16 px, половина сторон молча не строилась (шесть вершин → три
   *    отрезка). Поэтому сначала приближаем холст;
   *  - общая вершина двух соседних сторон кликается дважды подряд в один и
   *    тот же пиксель: внутри окна двойного клика браузер отдаёт это как
   *    dblclick, и вторая сторона не строится — отсюда пауза в 560 мс.
   */
  async drawPolygon(points: [number, number][]): Promise<void> {
    await this.zoomSketch(points);

    // Инструмент линии съедает клики строго парами: первый ставит начало,
    // второй достраивает отрезок и сбрасывается. Поэтому каждую вершину
    // кликаем дважды — как конец текущего отрезка и как начало следующего.
    await this.clickPrefixed("Лини");
    for (let i = 0; i < points.length; i++) {
      await this.clickSketchPoint(points[i]);
      await this.clickSketchPoint(points[(i + 1) % points.length]);
    }

    await this.clickPrefixed("Выбор");

    const drawn = (await this.sketchEntities()).filter((e) => e.type === "line" && !e.construction).length;
    if (drawn !== points.length) {
      throw new Error(`Контур: ожидалось ${points.length} отрезков, получено ${drawn}`);
    }
  }

  /**
   * Приблизить холст эскиза, чтобы стороны контура прошли порог инструмента.
   *
   * У пустого эскиза масштаб около 1 px/мм: шестигранник «под ключ 17»
   * умещался в 16 экранных пикселей, а инструмент линии отбрасывает отрезок
   * короче 4 px — половина сторон молча не строилась. На 2.5 px/мм строятся
   * все шесть, поэтому целимся с запасом.
   */
  private async zoomSketch(points: [number, number][]): Promise<void> {
    const shortestSide = Math.min(
      ...points.map((p, i) => {
        const q = points[(i + 1) % points.length];
        return Math.hypot(q[0] - p[0], q[1] - p[1]);
      }),
    );

    for (let i = 0; i < 14; i++) {
      const { pixelsPerMm } = await this.control<SketchProjection>("sketch.project", { points: [] });
      // Самая короткая сторона — минимум 25 px, с запасом над порогом в 4 px
      if (pixelsPerMm * shortestSide > 25) return;

      const center = await this.sketchCanvasCenter();
      await this.page.mouse.move(center[0], center[1]);
      await this.page.mouse.wheel(0, -240);
      await this.page.waitForTimeout(160);
    }
  }

  async sketchCanvasCenter(): Promise<[number, number]> {
    const { canvas } = await this.control<SketchProjection>("sketch.project", { points: [] });
    return [canvas.left + canvas.width / 2, canvas.top + canvas.height / 2];
  }

  private async clickSketchPoint([x, y]: [number, number]): Promise<void> {
    // Пересчитываем на месте: масштаб холста плывёт по мере роста эскиза.
    const [sx, sy] = await this.sketchPoint([x, y]);
    // Подводим курсор отдельным движением: инструмент строит превью по
    // mousemove, и без него клик приходит в точку, которой тул ещё не видел.
    await this.page.mouse.move(sx, sy);
    await this.page.waitForTimeout(130);
    await this.page.mouse.click(sx, sy);
    // Пауза длиннее окна двойного клика (500 мс): общая вершина двух соседних
    // сторон кликается дважды подряд в один и тот же пиксель, и внутри окна
    // браузер отдаёт это как dblclick — вторая сторона не строилась
    // (шесть вершин давали три отрезка).
    await this.page.waitForTimeout(560);
  }

  /** Прямоугольник через живой ввод размеров: клик угла → Ш, Tab, В, Enter. */
  async drawRect(x: number, y: number, width: number, height: number): Promise<void> {
    await this.clickPrefixed("Прямоуг");
    const [sx, sy] = await this.sketchPoint([x, y]);
    await this.page.mouse.click(sx, sy);
    await this.page.waitForTimeout(400);
    await this.page.keyboard.type(String(width));
    await this.page.keyboard.press("Tab");
    await this.page.keyboard.type(String(height));
    await this.page.keyboard.press("Enter");
    await this.page.waitForTimeout(500);
  }

  /** Окружность через живой ввод радиуса: клик центра → R, Enter. */
  async drawCircle(x: number, y: number, radius: number): Promise<void> {
    await this.clickPrefixed("Окруж");
    const [sx, sy] = await this.sketchPoint([x, y]);
    await this.page.mouse.click(sx, sy);
    await this.page.waitForTimeout(400);
    await this.page.keyboard.type(String(radius));
    await this.page.keyboard.press("Enter");
    await this.page.waitForTimeout(500);
  }

  async sketchEntities(): Promise<any[]> {
    return (await this.sketchState()).entities;
  }

  async addSketchEntities(entities: Record<string, unknown>[]): Promise<void> {
    await this.control("sketch.addEntities", { entities });
    await this.page.waitForTimeout(SETTLE_MS);
  }

  async finishSketch(): Promise<void> {
    await this.click("ОК");
    // Кнопка «Выдавить» в риббоне не реагирует, пока не закрыт режим эскиза,
    // а сохранение эскиза с сотней линий построения занимает заметное время.
    await expect
      .poll(async () => (await this.sketchState()).active, { message: "эскиз сохранён и закрыт", timeout: 60000 })
      .toBe(false);
    await this.settle();
  }

  private async settle(): Promise<void> {
    await this.idle();
    await this.page.waitForTimeout(SETTLE_MS);
  }

  // ── Операции ──────────────────────────────────────────────────────────

  /**
   * Выдавливание. distance — модуль; «Вырезать» по умолчанию идёт против нормали
   * эскиза (внутрь тела), reversed переворачивает сторону любой операции.
   */
  async extrude(opts: ExtrudeOpts): Promise<void> {
    await this.fillExtrudePanel(opts);
    await this.page.getByTestId("extrude-apply").dispatchEvent("click");
    await this.page.waitForTimeout(400);
    await expect(this.page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toHaveCount(0, { timeout: 60000 });
    await this.settle();
  }

  /** Выдавливание, которое должно быть отклонено: панель остаётся с текстом ошибки. */
  async extrudeExpectingError(opts: ExtrudeOpts, message: RegExp): Promise<void> {
    await this.fillExtrudePanel(opts);
    await this.page.getByTestId("extrude-apply").dispatchEvent("click");
    await expect(this.page.getByText(message)).toBeVisible({ timeout: 60000 });
    await expect(this.page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toBeVisible();
    await this.page.getByRole("button", { name: /Отмена/ }).click();
    await this.page.waitForTimeout(500);
    await this.idle();
  }

  private async fillExtrudePanel(opts: ExtrudeOpts): Promise<void> {
    await this.click("Выдавить");
    await expect(this.page.getByText("ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ")).toBeVisible();
    if (opts.operation) {
      await this.page.selectOption("select >> nth=0", opts.operation);
      await this.page.waitForTimeout(300);
    }
    if (opts.direction) {
      // Селектов в панели два-три (операция появляется только для эскиза на грани) —
      // выбираем тот, в котором есть нужный вариант.
      await this.page
        .locator("select")
        .filter({ has: this.page.locator('option[value="symmetric"]') })
        .selectOption(opts.direction);
      await this.page.waitForTimeout(300);
    }
    if (opts.reversed) {
      await this.page.getByTestId("extrude-reverse").check();
      await this.page.waitForTimeout(300);
    }
    await this.page.locator('input[type="text"]').first().fill(String(opts.distance));
    await this.page.keyboard.press("Enter");
    await this.page.waitForTimeout(500);
  }

  async fillet(edgeIds: string[], radius: number): Promise<void> {
    await this.fillFilletPanel(edgeIds, radius);
    await this.click("Применить");
    await expect(this.page.getByTestId("fillet-panel")).toHaveCount(0, { timeout: 90000 });
    await this.settle();
  }

  /**
   * Скругление, у которого допустимы оба исхода: построилось или отклонено.
   * Возвращает текст ошибки, если операция не прошла, и null, если прошла.
   */
  async filletOutcome(edgeIds: string[], radius: number): Promise<string | null> {
    await this.fillFilletPanel(edgeIds, radius);
    await this.click("Применить");
    const error = this.page.getByTestId("fillet-error");
    const panel = this.page.getByTestId("fillet-panel");
    await expect
      .poll(async () => (await error.count()) > 0 || (await panel.count()) === 0, {
        timeout: 90000,
      })
      .toBe(true);
    if ((await error.count()) === 0) {
      await this.settle();
      return null;
    }
    return (await error.first().textContent())?.trim() ?? "";
  }

  /** Скругление, которое геометрия не выдержит: панель остаётся с текстом ошибки. */
  async filletExpectingError(edgeIds: string[], radius: number, message: RegExp): Promise<void> {
    await this.fillFilletPanel(edgeIds, radius);
    await this.click("Применить");
    await expect(this.page.getByText(message)).toBeVisible({ timeout: 90000 });
    await expect(this.page.getByTestId("fillet-panel").first()).toBeVisible();
  }

  private async fillFilletPanel(edgeIds: string[], radius: number): Promise<void> {
    await this.click("Скругление");
    await expect(this.page.getByTestId("fillet-panel").first()).toBeVisible();

    this.useEdges((await this.topology()).edges);
    await this.setEdgeChain(false);
    for (const edgeId of edgeIds) await this.selectEdge(edgeId);

    await this.page.locator("input").first().fill(String(radius));
    await this.page.keyboard.press("Tab");
    await this.page.waitForTimeout(300);
  }

  // ── Резьба ────────────────────────────────────────────────────────────

  /**
   * Нарезать резьбу на цилиндрической грани у точки `spot` (мм, на поверхности).
   *
   * Сторону (внешняя/внутренняя) выбирает не тест, а ориентация грани на
   * сервере: стенка отверстия развёрнута к оси, бок стержня — от неё.
   */
  async thread(opts: ThreadOpts): Promise<void> {
    await this.openThreadPanel(opts.camera, opts.spot);
    await this.fillThreadPanel(opts);

    await this.page.getByTestId("thread-apply").dispatchEvent("click");
    await expect(this.page.getByTestId("thread-panel")).toHaveCount(0, { timeout: 120000 });
    await this.settle();
  }

  /**
   * Грань, на которой резьбы не будет: панель объясняет причину сразу при
   * выборе, ещё до «Применить», и кнопка построения остаётся недоступной.
   */
  async threadRejectedFace(
    camera: number[],
    spot: [number, number, number],
    message: RegExp,
  ): Promise<void> {
    await this.camera(camera);
    await this.click("Резьба");
    await expect(this.page.getByTestId("thread-panel")).toBeVisible();
    await this.page.waitForTimeout(300);
    await this.clickModelPoint(spot);

    await expect(this.page.getByTestId("thread-status")).toHaveText(message, { timeout: 30000 });
    await expect(this.page.getByTestId("thread-apply")).toBeDisabled();
    expect(await this.threadGhost(), "на негодной грани призрака нет").toBeNull();

    await this.closeThreadPanel();
  }

  /**
   * Открыть панель резьбы, выбрать грань, задать параметры — и остановиться
   * перед «Применить»: в этот момент в сцене должен висеть призрак.
   */
  async threadPreviewFor(opts: ThreadOpts): Promise<ThreadGhost | null> {
    await this.openThreadPanel(opts.camera, opts.spot);
    await this.fillThreadPanel(opts);
    return this.threadGhost();
  }

  /**
   * Покрутить сцену мышью, как это делает пользователь: зажал, потянул,
   * отпустил. Именно этот жест раньше снимал выделение — браузер по
   * отпусканию шлёт `click`, и попадание мимо тела сбрасывало грань.
   */
  async orbitDrag(dx = 120, dy = 40): Promise<void> {
    const box = await this.page.locator("canvas").first().boundingBox();
    if (!box) throw new Error("канвас вьюпорта не найден");
    // Тянем из угла, где заведомо нет тела: так проверяется именно защита от
    // протяжки, а не случайное попадание курсора обратно в грань.
    const startX = box.x + box.width * 0.22;
    const startY = box.y + box.height * 0.78;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await this.page.mouse.move(startX + (dx * i) / 8, startY + (dy * i) / 8);
    }
    await this.page.mouse.up();
    await this.page.waitForTimeout(700);
  }

  /** Применить резьбу в уже открытой панели (параметры заданы заранее). */
  async applyThreadPanel(): Promise<void> {
    await this.page.getByTestId("thread-apply").dispatchEvent("click");
    await expect(this.page.getByTestId("thread-panel")).toHaveCount(0, { timeout: 120000 });
    await this.settle();
  }

  /** Поправить поля открытой панели резьбы (призрак перестроится сам). */
  async setThreadFields(opts: Partial<ThreadOpts>): Promise<void> {
    await this.fillThreadPanel(opts as ThreadOpts);
  }

  /** Закрыть панель резьбы, ничего не построив. */
  async closeThreadPanel(): Promise<void> {
    await this.click("Закрыть");
    await expect(this.page.getByTestId("thread-panel")).toHaveCount(0);
    await this.page.waitForTimeout(300);
  }

  /** Призрак резьбы в сцене прямо сейчас (null — его нет). */
  async threadGhost(): Promise<ThreadGhost | null> {
    return (await this.control<{ threadPreview: ThreadGhost | null }>("scene.get")).threadPreview;
  }

  private async openThreadPanel(camera: number[], spot: [number, number, number]): Promise<void> {
    await this.camera(camera);
    await this.click("Резьба");
    await expect(this.page.getByTestId("thread-panel")).toBeVisible();
    await this.page.waitForTimeout(300);
    await this.clickModelPoint(spot);
    await this.page.waitForTimeout(600);

    // Клик мимо тела оставляет панель без грани, и «Применить» молча ничего
    // не делает — ловим это здесь, а не по загадочному таймауту ниже.
    await expect(
      this.page.getByTestId("thread-apply"),
      `клик по ${spot.join(",")} не выбрал грань`,
    ).toBeEnabled();
  }

  private async fillThreadPanel(opts: ThreadOpts): Promise<void> {
    const panel = this.page.getByTestId("thread-panel");
    const setField = async (testId: string, value: number) => {
      const input = panel.getByTestId(testId).locator("input");
      await input.fill(String(value));
      await input.press("Tab");
      await this.page.waitForTimeout(250);
    };

    // Пресет выставляет сразу шаг, глубину, профиль и заходы; поля ниже
    // перекрывают его значения по одному.
    if (opts.preset) {
      await this.page.getByTestId(`thread-preset-${opts.preset}`).dispatchEvent("click");
      await this.page.waitForTimeout(300);
    }
    if (opts.pitch !== undefined) await setField("thread-pitch", opts.pitch);
    if (opts.depthPercent !== undefined) await setField("thread-depth-ratio", opts.depthPercent);
    if (opts.crestPercent !== undefined) await setField("thread-crest", opts.crestPercent);
    if (opts.starts !== undefined) await setField("thread-starts", opts.starts);
    if (opts.length !== undefined) await setField("thread-length", opts.length);
    if (opts.offset !== undefined) await setField("thread-offset", opts.offset);
    if (opts.leftHanded) {
      await this.page.getByTestId("thread-left").dispatchEvent("click");
      await this.page.waitForTimeout(250);
    }
  }

  /**
   * Клик ровно по ребру. Порог подбора ребра постоянен в пикселях, поэтому
   * промах лечится приближением камеры и сменой ракурса; повторный клик по той
   * же точке снимает случайно выбранного соседа.
   */
  private async selectEdge(edgeId: string): Promise<void> {
    const attempts = [
      { radius: 115, skip: 0 },
      { radius: 85, skip: 0 },
      { radius: 115, skip: 4 },
      { radius: 70, skip: 0 },
      { radius: 85, skip: 6 },
      { radius: 60, skip: 0 },
      { radius: 115, skip: 12 },
      { radius: 70, skip: 8 },
    ];

    for (const { radius, skip } of attempts) {
      const plan = await this.aimAtEdge(edgeId, radius, skip);
      if (!plan) continue;

      const spot = await this.pointOnEdge(edgeId);
      const [x, y] = (spot ?? plan).scr;
      await this.page.mouse.click(x, y);
      await this.page.waitForTimeout(350);

      if ((await this.selectedEdges()).includes(edgeId)) return;

      await this.page.mouse.click(x, y);
      await this.page.waitForTimeout(250);
    }
    throw new Error(`Ребро ${edgeId} не удалось выбрать кликом`);
  }

  useEdges(edges: Edge[]): void {
    this.edges = edges;
  }

  private edge(edgeId: string): Edge | null {
    return this.edges.find((edge) => edge.id === edgeId) ?? null;
  }

  private async planEdgePick(target: Edge, radius: number, skip: number): Promise<EdgePickPlan | null> {
    const points = edgePickPoints(target, this.edges);
    const views = candidateViews(radius);
    const replies = await this.page.evaluate(
      (job) =>
        Promise.all(
          job.views.map((position) =>
            window.cadControl!.request({
              op: "viewport.project",
              params: { points: job.points, camera: { position, target: [0, 0, 0] } },
            }),
          ),
        ),
      { points, views },
    );

    const variants: EdgePickPlan[] = [];
    replies.forEach((reply, index) => {
      if (!reply.ok) throw new Error(`cadControl viewport.project: ${reply.error.code} — ${reply.error.message}`);
      const projection = reply.result as Projection;
      const best = clearestSpot(projection.points, projection.canvas);
      if (best) variants.push({ pos: views[index], ...best });
    });
    variants.sort((x, y) => y.clearance - x.clearance);
    return variants[skip] ?? null;
  }

  async aimAtEdge(edgeId: string, radius = 115, skip = 0): Promise<EdgePickPlan | null> {
    const target = this.edge(edgeId);
    const plan = target ? await this.planEdgePick(target, radius, skip) : null;
    if (plan) await this.camera(plan.pos);
    return plan;
  }

  async pointOnEdge(edgeId: string): Promise<EdgeSpot | null> {
    const target = this.edge(edgeId);
    if (!target) return null;
    const projection = await this.control<Projection>("viewport.project", {
      points: edgePickPoints(target, this.edges),
    });
    return clearestSpot(projection.points, projection.canvas);
  }

  async pointBesideEdge(edgeId: string, px: number): Promise<EdgeSpot | null> {
    const target = this.edge(edgeId);
    const base = await this.pointOnEdge(edgeId);
    if (!target || !base) return null;
    const { points } = await this.control<Projection>("viewport.project", { points: [target.a, target.b] });
    return offsetFromEdge(base, points[0], points[1], px);
  }

  async hoveredEdge(): Promise<string | null> {
    const { hoveredEdge } = await this.control<{ hoveredEdge: { edgeId: string } | null }>("selection.get");
    return hoveredEdge?.edgeId ?? null;
  }

  async highlightedEdges(): Promise<string[]> {
    const { highlightedEdges } = await this.control<{ highlightedEdges: { edgeId: string }[] }>("selection.get");
    return highlightedEdges.map((edge) => edge.edgeId);
  }

  async setEdgeChain(enabled: boolean): Promise<void> {
    await this.control("selection.setEdgeChain", { enabled });
  }

  async selectedEdges(): Promise<string[]> {
    const { edges } = await this.control<{ edges: { edgeId: string }[] }>("selection.get");
    return edges.map((edge) => edge.edgeId);
  }

  // ── Проверки по данным ────────────────────────────────────────────────

  async visibleBodyIds(): Promise<string[]> {
    await this.idle();
    return (await this.control<{ visibleBodyIds: string[] }>("scene.get")).visibleBodyIds;
  }

  async topology(): Promise<Topology> {
    let found: Topology | null = null;
    await expect
      .poll(
        async () => {
          const bodyId = (await this.visibleBodyIds()).at(-1);
          if (!bodyId) return false;
          const topology = await this.request("topology", { bodyId });
          const stats = await this.request("mesh.stats", { bodyId });
          if (!topology.ok || !stats.ok) return false;
          const brep = topology.result as {
            bbox: Topology["bbox"];
            faces: unknown[];
            edges: { id: string; start: number[]; end: number[] }[];
          };
          const mesh = stats.result as { zLevels: number[]; openEdges: number };
          found = {
            bodyId,
            faces: brep.faces.length,
            bbox: brep.bbox,
            zLevels: mesh.zLevels,
            openEdges: mesh.openEdges,
            edges: brep.edges.map((edge) => ({ id: edge.id, a: edge.start, b: edge.end })),
          };
          return true;
        },
        { message: "видимое тело в сцене и его топология в канале управления", timeout: 30000 },
      )
      .toBe(true);
    return found as unknown as Topology;
  }

  async visibleBodyCount(): Promise<number> {
    return (await this.visibleBodyIds()).length;
  }

  async timeline(): Promise<{ kind: string; label: string; status: string; params: any }[]> {
    const res = await this.page.request.get(`/api/projects/${this.projectId}/document`, {
      headers: this.authHeader,
    });
    expect(res.ok(), "документ проекта").toBeTruthy();
    return (await res.json()).timeline;
  }
}

const near = (a: number, b: number, eps = 0.3) => Math.abs(a - b) < eps;

/** Рёбра, целиком лежащие на высоте z. */
export function edgesAtZ(topo: Topology, z: number): Edge[] {
  return topo.edges.filter((e) => near(e.a[2], z) && near(e.b[2], z));
}

/** Вертикальные рёбра (углы) между двумя высотами. */
export function verticalEdges(topo: Topology, z1: number, z2: number): Edge[] {
  const lo = Math.min(z1, z2);
  const hi = Math.max(z1, z2);
  return topo.edges.filter(
    (e) =>
      near(e.a[0], e.b[0]) &&
      near(e.a[1], e.b[1]) &&
      near(Math.min(e.a[2], e.b[2]), lo) &&
      near(Math.max(e.a[2], e.b[2]), hi),
  );
}

/** Максимальный габарит ребра по XY — отделяет наружный контур от внутреннего. */
export function maxXY(e: Edge): number {
  return Math.max(Math.abs(e.a[0]), Math.abs(e.a[1]), Math.abs(e.b[0]), Math.abs(e.b[1]));
}

/** Рядом ли ребро с одной из точек (для отсева кромок углублений под ножки). */
export function nearAnyXY(e: Edge, points: number[][], radius: number): boolean {
  return points.some(
    (p) =>
      Math.hypot(e.a[0] - p[0], e.a[1] - p[1]) < radius &&
      Math.hypot(e.b[0] - p[0], e.b[1] - p[1]) < radius,
  );
}
