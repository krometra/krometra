import { SUPPORTED_VERSION, isReply, unwrap } from "./channel.mjs";
import { ToolError, firstLine } from "./errors.mjs";
import { loadPlaywright } from "./playwright.mjs";

const VIEWPORT = { width: 1440, height: 900 };
const POLL_MS = 100;
const PAGE_ERROR_LIMIT = 5;
const REPLY_EXCERPT = 300;
const PAGE_RELOADED = /Execution context was destroyed|navigation/i;

function detectLanding() {
  if (window.location.pathname.startsWith("/login")) return "login";
  return window.cadControl ? "channel" : false;
}

function awaitChannelReady(timeoutMs) {
  const expired = new Promise((resolve) => {
    setTimeout(() => resolve({ ready: false }), timeoutMs);
  });
  const ready = Promise.resolve(window.cadControl.ready).then(() => ({
    ready: true,
    version: window.cadControl.version,
  }));
  return Promise.race([ready, expired]);
}

function sendToChannel(request) {
  return window.cadControl.request(request);
}

const seconds = (ms) => Math.round(ms / 100) / 10;

function failAfter(ms, message) {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ToolError(message)), ms);
  });
  return { expired, cancel: () => clearTimeout(timer) };
}

export class Editor {
  #config;
  #session;
  #log;
  #browser = null;
  #context = null;
  #page = null;
  #opened = null;
  #queue = Promise.resolve();
  #pageErrors = [];

  constructor(config, session, log) {
    this.#config = config;
    this.#session = session;
    this.#log = log;
  }

  open(projectId) {
    const opening = this.#queue.then(() => this.#open(projectId));
    this.#queue = opening.catch(() => {});
    return opening;
  }

  async request(op, params) {
    const reply = await this.evaluate(op, sendToChannel, params === undefined ? { op } : { op, params });
    if (isReply(reply)) return reply;
    throw new ToolError(`Канал ответил на "${op}" не по контракту: ${JSON.stringify(reply)?.slice(0, REPLY_EXCERPT)}`);
  }

  async query(op, params) {
    return unwrap(await this.request(op, params));
  }

  async evaluate(label, script, argument) {
    if (!this.#opened) throw new ToolError("Проект не открыт: сначала вызови cad_open_project.");
    const limit = this.#config.requestTimeoutMs;
    const timeout = failAfter(limit, `"${label}" не ответил за ${seconds(limit)} с: редактор занят или завис.`);
    try {
      return await Promise.race([this.#page.evaluate(script, argument), timeout.expired]);
    } catch (error) {
      if (error instanceof ToolError) throw error;
      throw new ToolError(
        `"${label}" не выполнен: ${firstLine(error.message)}. ` +
          "Если страница перезагрузилась или закрылась, открой проект заново через cad_open_project.",
      );
    } finally {
      timeout.cancel();
    }
  }

  async close() {
    const browser = this.#browser;
    this.#forgetBrowser();
    await browser?.close().catch(() => {});
  }

  async #open(projectId) {
    this.#opened = null;
    const page = await this.#ensurePage();
    this.#pageErrors.length = 0;
    const url = `${this.#config.baseUrl}/editor/${encodeURIComponent(projectId)}`;
    const deadline = Date.now() + this.#config.readyTimeoutMs;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: this.#config.readyTimeoutMs });
    } catch (error) {
      throw new ToolError(`Страница ${url} не открылась: ${firstLine(error.message)}`);
    }
    const channelVersion = await this.#awaitReady(page, url, deadline);
    this.#opened = { projectId, url };
    this.#log(`opened project ${projectId}`);
    return { ...this.#opened, channelVersion };
  }

  async #awaitChannel(page, url, deadline) {
    const landing = await page
      .waitForFunction(detectLanding, null, { timeout: this.#remaining(deadline), polling: POLL_MS })
      .then(
        (handle) => handle.jsonValue(),
        () => "none",
      );
    if (landing === "channel") return;
    if (landing === "login") {
      await this.#dropContext();
      throw new ToolError(
        "Редактор перенаправил на страницу входа: сессия не принята. Повтори cad_open_project; " +
          "если не поможет, проверь, что ключ CAD_STUDIO_API_KEY не отозван (или CAD_STUDIO_EMAIL и CAD_STUDIO_PASSWORD).",
      );
    }
    throw new ToolError(
      `За ${seconds(this.#config.readyTimeoutMs)} с на ${url} не появился window.cadControl. ` +
        `Проверь, что по этому адресу запущена Крометра с каналом управления.${this.#pageErrorNote()}`,
    );
  }

  async #awaitReady(page, url, deadline) {
    const outcome = await this.#readyOutcome(page, url, deadline);
    if (!outcome.ready) {
      throw new ToolError(
        `cadControl.ready не разрешился за ${seconds(this.#config.readyTimeoutMs)} с: редактор не дошёл до готовности ` +
          "(документ или ядро не загрузились). Повтори cad_open_project или увеличь CAD_STUDIO_READY_TIMEOUT_MS." +
          this.#pageErrorNote(),
      );
    }
    if (outcome.version !== SUPPORTED_VERSION) {
      throw new ToolError(`Версия канала управления ${outcome.version}, сервер поддерживает ${SUPPORTED_VERSION}.`);
    }
    return outcome.version;
  }

  async #readyOutcome(page, url, deadline) {
    for (;;) {
      await this.#awaitChannel(page, url, deadline);
      const outcome = await page.evaluate(awaitChannelReady, this.#remaining(deadline)).catch((error) => {
        if (PAGE_RELOADED.test(error.message) && Date.now() < deadline) return null;
        throw new ToolError(
          `cadControl.ready завершился ошибкой: ${firstLine(error.message)}.${this.#pageErrorNote()}`,
        );
      });
      if (outcome) return outcome;
    }
  }

  #remaining(deadline) {
    return Math.max(deadline - Date.now(), POLL_MS);
  }

  #pageErrorNote() {
    return this.#pageErrors.length ? ` Ошибки страницы: ${this.#pageErrors.join(" | ")}` : "";
  }

  async #ensurePage() {
    if (this.#page) return this.#page;
    const storageState = await this.#session.browserStorageState();
    const browser = await this.#ensureBrowser();
    await this.#dropContext();
    const context = await browser.newContext({ viewport: VIEWPORT, storageState });
    const page = await context.newPage();
    const forgetIfCurrent = () => {
      if (this.#page === page) this.#forgetPage();
    };
    page.on("pageerror", (error) => this.#rememberPageError(error));
    page.on("close", forgetIfCurrent);
    page.on("crash", forgetIfCurrent);
    this.#context = context;
    this.#page = page;
    return page;
  }

  async #ensureBrowser() {
    if (this.#browser) return this.#browser;
    const { chromium } = await loadPlaywright();
    const { browserChannel, headless } = this.#config;
    const browser = await chromium
      .launch({ channel: browserChannel, headless, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false })
      .catch((error) => {
        throw new ToolError(
          `Браузер (${browserChannel}) не запустился: ${firstLine(error.message)}. ` +
            "Установи Chromium (cd web && npx playwright install chromium) или задай " +
            "CAD_STUDIO_BROWSER_CHANNEL=chrome, чтобы взять установленный Google Chrome.",
        );
      });
    browser.on("disconnected", () => {
      if (this.#browser === browser) this.#forgetBrowser();
    });
    this.#browser = browser;
    this.#log(`browser started (${browserChannel}, ${headless ? "headless" : "visible"})`);
    return browser;
  }

  #rememberPageError(error) {
    this.#pageErrors.push(firstLine(error.message));
    if (this.#pageErrors.length > PAGE_ERROR_LIMIT) this.#pageErrors.shift();
  }

  #forgetPage() {
    this.#page = null;
    this.#opened = null;
  }

  #forgetBrowser() {
    this.#browser = null;
    this.#context = null;
    this.#forgetPage();
  }

  async #dropContext() {
    const context = this.#context;
    this.#context = null;
    this.#forgetPage();
    await context?.close().catch(() => {});
  }
}
