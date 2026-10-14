import { ToolError, firstLine } from "../errors.mjs";

const TOKEN_TTL_MS = 10 * 60_000;
const HTTP_TIMEOUT_MS = 30_000;

function summarizeProject(project) {
  return {
    id: project.id,
    name: project.name,
    ...(project.description && { description: project.description }),
    updated_at: project.updated_at,
  };
}

async function failureText(response) {
  const body = await response.json().catch(() => null);
  const detail = body?.detail ?? body;
  if (typeof detail === "string") return detail;
  if (detail?.error) return [detail.error, detail.error_description].filter(Boolean).join(": ");
  return response.statusText;
}

export class ApiSession {
  #backendUrl;
  #apiKey;
  #forwardedFor;
  #token = null;
  #tokenAt = 0;
  #userId = null;

  constructor({ backendUrl, apiKey, forwardedFor }) {
    this.#backendUrl = backendUrl;
    this.#apiKey = apiKey;
    this.#forwardedFor = forwardedFor;
  }

  setForwardedFor(value) {
    this.#forwardedFor = value;
  }

  async userId() {
    if (this.#userId) return this.#userId;
    const response = await this.#authorized("GET", "/api/auth/me");
    await this.#expectOk(response, "Профиль пользователя");
    this.#userId = (await response.json()).id;
    return this.#userId;
  }

  async listProjects() {
    const response = await this.#authorized("GET", "/api/projects/");
    await this.#expectOk(response, "Список проектов");
    return (await response.json()).projects.map(summarizeProject);
  }

  async createProject({ name, description }) {
    const response = await this.#authorized("POST", "/api/projects/", { name, description });
    await this.#expectOk(response, "Создание проекта");
    return summarizeProject(await response.json());
  }

  async getProject(projectId) {
    const response = await this.#authorized("GET", `/api/projects/${encodeURIComponent(projectId)}`);
    if (response.status === 404) throw new ToolError(`Проект ${projectId} не найден у владельца ключа: возьми id из cad_list_projects.`);
    await this.#expectOk(response, "Чтение проекта");
    return summarizeProject(await response.json());
  }

  async login() {
    const body = new URLSearchParams({ grant_type: "api_key", api_key: this.#apiKey });
    const response = await this.#fetch("POST", "/api/auth/token", body, {});
    if (!response.ok) {
      throw new ToolError(`Ключ доступа не принят (${response.status}): ${firstLine(await failureText(response))}. Создай новый ключ на странице «Аккаунт».`);
    }
    this.#token = (await response.json()).access_token;
    this.#tokenAt = Date.now();
    return this.#token;
  }

  async #accessToken() {
    if (this.#token && Date.now() - this.#tokenAt < TOKEN_TTL_MS) return this.#token;
    return this.login();
  }

  async #authorized(method, path, json) {
    const send = async (token) => this.#fetch(method, path, json === undefined ? undefined : JSON.stringify(json), {
      Authorization: `Bearer ${token}`,
      ...(json === undefined ? {} : { "Content-Type": "application/json" }),
    });
    const response = await send(await this.#accessToken());
    return response.status === 401 ? send(await this.login()) : response;
  }

  async #fetch(method, path, body, headers) {
    try {
      return await fetch(`${this.#backendUrl}${path}`, {
        method,
        body,
        headers: { ...headers, ...(this.#forwardedFor ? { "X-Forwarded-For": this.#forwardedFor } : {}) },
        redirect: "manual",
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch (error) {
      throw new ToolError(`${method} ${path}: сервер Крометры недоступен (${firstLine(error.message)}). Повтори через минуту.`);
    }
  }

  async #expectOk(response, action) {
    if (response.ok) return;
    throw new ToolError(`${action}: ${response.status} ${firstLine(await failureText(response))}`);
  }
}

export async function verifyAccessToken(backendUrl, token, forwardedFor) {
  const response = await fetch(`${backendUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}`, ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}) },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return (await response.json()).id ?? null;
}
