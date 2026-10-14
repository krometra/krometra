const DEFAULT_URL = "http://localhost:5173";
const DEFAULT_BROWSER_CHANNEL = "chromium";
const DEFAULT_READY_TIMEOUT_MS = 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DISABLED = new Set(["0", "false", "no", "off"]);

function positiveInt(raw, fallback) {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadConfig(env) {
  return {
    baseUrl: (env.CAD_STUDIO_URL || DEFAULT_URL).replace(/\/+$/, ""),
    apiKey: (env.CAD_STUDIO_API_KEY ?? "").trim(),
    email: env.CAD_STUDIO_EMAIL || "",
    password: env.CAD_STUDIO_PASSWORD || "",
    headless: !DISABLED.has((env.CAD_STUDIO_HEADLESS ?? "").trim().toLowerCase()),
    browserChannel: env.CAD_STUDIO_BROWSER_CHANNEL || DEFAULT_BROWSER_CHANNEL,
    readyTimeoutMs: positiveInt(env.CAD_STUDIO_READY_TIMEOUT_MS, DEFAULT_READY_TIMEOUT_MS),
    requestTimeoutMs: positiveInt(env.CAD_STUDIO_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
  };
}

export function missingCredentials(config) {
  if (config.apiKey) return [];
  if (!config.email && !config.password) return ["CAD_STUDIO_API_KEY"];
  return [
    ["CAD_STUDIO_EMAIL", config.email],
    ["CAD_STUDIO_PASSWORD", config.password],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

export function apiKeyHint(config) {
  return `Создай ключ доступа на странице ${config.baseUrl}/account и передай его MCP-серверу в CAD_STUDIO_API_KEY.`;
}

export function credentialsProblem(config) {
  const missing = missingCredentials(config);
  if (!missing.length) return null;
  if (missing.includes("CAD_STUDIO_API_KEY")) {
    return `В env MCP-сервера не задан CAD_STUDIO_API_KEY. ${apiKeyHint(config)}`;
  }
  return `В env MCP-сервера не задано: ${missing.join(", ")}. Вместо почты и пароля удобнее ключ: ${apiKeyHint(config)}`;
}
