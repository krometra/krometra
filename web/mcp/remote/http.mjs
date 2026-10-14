import { createHash, randomUUID } from "node:crypto";
import { createRedactor } from "../errors.mjs";
import { createProtocol } from "../protocol.mjs";
import { INSTRUCTIONS, createTools } from "../tools.mjs";
import { ApiSession } from "./apiSession.mjs";
import { RelayEditor } from "./relayEditor.mjs";
import { createRemoteFileTools } from "./remoteFiles.mjs";

const SERVER_INFO = { name: "krometra", version: "0.2.0" };
const MAX_RPC_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SESSION_IDLE_MS = 60 * 60_000;
const API_KEY = /^Bearer\s+(krm_[\w-]+)$/;

function keyHash(apiKey) {
  return createHash("sha256").update(apiKey).digest("hex");
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
}

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("слишком большой запрос"), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function asciiName(filename) {
  return filename.replace(/[^\w.-]+/g, "_") || "model";
}

export function createRemoteHandler({ config, hub, files, uploads, log }) {
  const sessions = new Map();

  function createSession(apiKey) {
    const redactor = createRedactor();
    redactor.add(apiKey);
    const session = new ApiSession({ backendUrl: config.backendUrl, apiKey });
    const editor = new RelayEditor({ hub, session, config });
    const fileTools = createRemoteFileTools({ editor, session, files, uploads, publicUrl: config.publicUrl, ttlMinutes: config.fileTtlMinutes });
    const handle = createProtocol({
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS,
      tools: createTools({ session, editor, fileTools }),
      redact: redactor.redact,
      log,
    });
    return { id: randomUUID(), keyHash: keyHash(apiKey), session, editor, handle, touchedAt: Date.now() };
  }

  function sweepSessions() {
    const now = Date.now();
    for (const [id, entry] of sessions) {
      if (now - entry.touchedAt > SESSION_IDLE_MS) {
        entry.editor.close();
        sessions.delete(id);
      }
    }
  }

  function sessionFor(request, apiKey, messages) {
    sweepSessions();
    const requested = request.headers["mcp-session-id"];
    const existing = typeof requested === "string" ? sessions.get(requested) : null;
    if (existing && existing.keyHash === keyHash(apiKey)) return existing;
    const initializing = messages.some((message) => message?.method === "initialize");
    if (requested && !initializing) return null;
    const created = createSession(apiKey);
    sessions.set(created.id, created);
    return created;
  }

  async function handleRpc(request, response) {
    const apiKey = API_KEY.exec(request.headers.authorization ?? "")?.[1];
    if (!apiKey) {
      json(response, 401, { error: "Нужен заголовок Authorization: Bearer krm_... — ключ доступа со страницы «Аккаунт»." });
      return;
    }
    let payload;
    try {
      payload = JSON.parse((await readBody(request, MAX_RPC_BYTES)).toString("utf8"));
    } catch (error) {
      json(response, error.status ?? 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    const messages = Array.isArray(payload) ? payload : [payload];
    const entry = sessionFor(request, apiKey, messages);
    if (!entry) {
      json(response, 404, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Сессия MCP не найдена: переподключись." } });
      return;
    }
    entry.touchedAt = Date.now();
    entry.session.setForwardedFor(request.headers["x-forwarded-for"]);
    const replies = (await Promise.all(messages.map((message) => entry.handle(message)))).filter(Boolean);
    const headers = { "Mcp-Session-Id": entry.id };
    if (replies.length === 0) {
      response.writeHead(202, headers);
      response.end();
      return;
    }
    json(response, 200, Array.isArray(payload) ? replies : replies[0], headers);
  }

  function handleDownload(response, token) {
    const file = files.get(token);
    if (!file) {
      json(response, 404, { error: "Файл не найден или ссылка просрочена: повтори cad_export." });
      return;
    }
    response.writeHead(200, {
      "Content-Type": file.mime,
      "Content-Length": file.bytes.length,
      "Content-Disposition": `attachment; filename="${asciiName(file.filename)}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    });
    response.end(file.bytes);
  }

  async function handleUpload(request, response, token) {
    const slot = uploads.get(token);
    if (!slot || slot.bytes) {
      json(response, 404, { error: "Ссылка загрузки не найдена, просрочена или уже использована: вызови cad_import заново." });
      return;
    }
    try {
      slot.bytes = await readBody(request, MAX_UPLOAD_BYTES);
    } catch (error) {
      json(response, error.status ?? 400, { error: `Файл не принят: ${error.message}.` });
      return;
    }
    const name = request.headers["x-file-name"];
    slot.filename = typeof name === "string" && /\.(step|stp)$/i.test(name) ? decodeURIComponent(name) : "upload.step";
    json(response, 200, { uploaded: slot.bytes.length, filename: slot.filename });
  }

  return async function handle(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    try {
      if (url.pathname === "/mcp" && request.method === "POST") return await handleRpc(request, response);
      if (url.pathname === "/mcp" && request.method === "DELETE") {
        sessions.delete(String(request.headers["mcp-session-id"] ?? ""));
        response.writeHead(204);
        return response.end();
      }
      if (url.pathname === "/mcp") return json(response, 405, { error: "Поддерживается только POST (Streamable HTTP без SSE)." }, { Allow: "POST, DELETE" });
      if (url.pathname === "/mcp/health") return json(response, 200, { ok: true, tabs: hub.size });
      const download = /^\/mcp\/files\/([\w-]+)$/.exec(url.pathname);
      if (download && request.method === "GET") return handleDownload(response, download[1]);
      const upload = /^\/mcp\/uploads\/([\w-]+)$/.exec(url.pathname);
      if (upload && request.method === "PUT") return await handleUpload(request, response, upload[1]);
      json(response, 404, { error: "Не найдено." });
    } catch (error) {
      log(error.stack ?? error);
      if (!response.headersSent) json(response, 500, { error: "Внутренняя ошибка MCP-сервера." });
    }
  };
}
