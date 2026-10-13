import { missingCredentials } from "./config.mjs";
import { ToolError, firstLine } from "./errors.mjs";
import { loadPlaywright } from "./playwright.mjs";

const APP_NAME = "Крометра";
const HTTP_TIMEOUT_MS = 30_000;
const BODY_EXCERPT = 300;

function describeDetail(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((issue) => `${(issue.loc ?? []).join(".")}: ${issue.msg}`).join("; ");
  if (detail?.error) return [detail.error, detail.error_description].filter(Boolean).join(": ");
  return "";
}

async function describeFailure(response) {
  const body = await response.json().catch(() => null);
  return describeDetail(body?.detail ?? body) || response.statusText();
}

function summarizeProject(project) {
  return {
    id: project.id,
    name: project.name,
    ...(project.description && { description: project.description }),
    updated_at: project.updated_at,
  };
}

export class Session {
  #config;
  #redactor;
  #api = null;
  #accessToken = null;
  #loginInFlight = null;
  #appVerified = false;

  constructor(config, redactor) {
    this.#config = config;
    this.#redactor = redactor;
    redactor.add(config.password);
  }

  async listProjects() {
    const response = await this.#authorized("GET", "/api/projects/");
    await this.#expectOk(response, "Список проектов");
    const { projects } = await response.json();
    return projects.map(summarizeProject);
  }

  async createProject({ name, description }) {
    const response = await this.#authorized("POST", "/api/projects/", { data: { name, description } });
    await this.#expectOk(response, "Создание проекта");
    return summarizeProject(await response.json());
  }

  async getProject(projectId) {
    const response = await this.#authorized("GET", `/api/projects/${encodeURIComponent(projectId)}`);
    if (response.status() === 404) {
      throw new ToolError(
        `Проект ${projectId} не найден у пользователя ${this.#config.email}: возьми id из cad_list_projects.`,
      );
    }
    await this.#expectOk(response, "Чтение проекта");
    return summarizeProject(await response.json());
  }

  async browserStorageState() {
    await this.login();
    const api = await this.#context();
    return api.storageState();
  }

  login() {
    this.#loginInFlight ??= this.#passwordGrant().finally(() => {
      this.#loginInFlight = null;
    });
    return this.#loginInFlight;
  }

  async dispose() {
    const api = await this.#api?.catch(() => null);
    this.#api = null;
    await api?.dispose();
  }

  #context() {
    this.#api ??= loadPlaywright().then(({ request }) => request.newContext({ baseURL: this.#config.baseUrl }));
    return this.#api;
  }

  async #send(method, path, options = {}) {
    try {
      const api = await this.#context();
      return await api.fetch(path, { method, maxRedirects: 0, timeout: HTTP_TIMEOUT_MS, ...options });
    } catch (error) {
      if (error instanceof ToolError) throw error;
      throw new ToolError(
        `${method} ${path}: нет связи с ${this.#config.baseUrl} (${firstLine(error.message)}). ` +
          "Поднят ли стек (make up) и dev-сервер фронта (cd web && npm run dev)? Проверь CAD_STUDIO_URL.",
      );
    }
  }

  async #verifyApp() {
    if (this.#appVerified) return;
    const response = await this.#send("GET", "/api/health");
    const body = await response.json().catch(() => null);
    if (body?.app !== APP_NAME) {
      throw new ToolError(
        `По адресу ${this.#config.baseUrl} отвечает не Крометра (/api/health: ${response.status()}). ` +
          "Порт 5173 бывает занят другим проектом: проверь CAD_STUDIO_URL.",
      );
    }
    this.#appVerified = true;
  }

  async #passwordGrant() {
    const missing = missingCredentials(this.#config);
    if (missing.length) throw new ToolError(`В env MCP-сервера не задано: ${missing.join(", ")}.`);
    await this.#verifyApp();
    const response = await this.#send("POST", "/api/auth/token", {
      form: { grant_type: "password", username: this.#config.email, password: this.#config.password },
    });
    if (!response.ok()) {
      throw new ToolError(
        `Вход не удался (${response.status()}): ${await describeFailure(response)}. ` +
          "Проверь CAD_STUDIO_EMAIL и CAD_STUDIO_PASSWORD.",
      );
    }
    const { access_token: accessToken } = await response.json();
    this.#redactor.add(accessToken);
    this.#accessToken = accessToken;
  }

  #sendAuthorized(method, path, options) {
    return this.#send(method, path, { ...options, headers: { Authorization: `Bearer ${this.#accessToken}` } });
  }

  async #authorized(method, path, options = {}) {
    if (!this.#accessToken) await this.login();
    const response = await this.#sendAuthorized(method, path, options);
    if (response.status() !== 401) return response;
    await this.login();
    return this.#sendAuthorized(method, path, options);
  }

  async #expectOk(response, action) {
    if (response.ok()) return;
    const status = response.status();
    if (status >= 300 && status < 400) {
      throw new ToolError(
        `${action}: редирект ${status} на ${response.headers().location}. ` +
          "Запрос ушёл мимо vite-прокси: проверь CAD_STUDIO_URL и завершающий слэш у роута.",
      );
    }
    const text = (await describeFailure(response)).slice(0, BODY_EXCERPT);
    throw new ToolError(`${action}: ${status} ${text}`);
  }
}
