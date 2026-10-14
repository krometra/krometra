import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { CANVAS } from "./model.mjs";

export const STUB_USER = { email: "mcp-stub@example.com", password: "stub-pass-123" };
export const STUB_API_KEY = "krm_stub-key-0123456789abcdefghijklmnopqrstuvw";
export const PAGE_MODES = ["never-ready", "no-channel", "reload-once"];

const STATIC_FILES = ["/page.mjs", "/model.mjs"];
const REFRESH_COOKIE = "refresh_token";
const SEEDED = ["ready-project", ...PAGE_MODES];

const base64url = (value) => Buffer.from(value).toString("base64url");
const fakeJwt = () =>
  `${base64url('{"alg":"HS256"}')}.${base64url(`{"sub":"stub","jti":"${randomBytes(6).toString("hex")}"}`)}.${randomBytes(16).toString("base64url")}`;

function editorPage(projectId) {
  const mode = PAGE_MODES.includes(projectId) ? projectId : "ready";
  const style = `position:absolute;left:${CANVAS.left}px;top:${CANVAS.top}px;width:${CANVAS.width}px;height:${CANVAS.height}px`;
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Крометра stub</title></head>
<body style="margin:0" data-mode="${mode}" data-project="${projectId}">
<canvas id="viewport" width="${CANVAS.width * CANVAS.pixelRatio}" height="${CANVAS.height * CANVAS.pixelRatio}" style="${style}"></canvas>
<script type="module" src="/page.mjs"></script>
</body>
</html>`;
}

function makeProject(id, name, description = null) {
  const now = new Date().toISOString();
  return { id, owner_id: "stub-owner", name, description, thumbnail: null, created_at: now, updated_at: now };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function cookieValue(request, name) {
  const pairs = (request.headers.cookie ?? "").split(";").map((pair) => pair.trim().split("="));
  return pairs.find(([key]) => key === name)?.[1] ?? null;
}

export async function startStubApp() {
  const projects = new Map(SEEDED.map((id) => [id, makeProject(id, `Проект ${id}`)]));
  const accessTokens = new Map();
  const refreshTokens = new Map();
  const issued = [];
  const stats = { logins: 0, grants: { password: 0, api_key: 0 }, refreshes: 0, replays: 0, redirects: 0 };
  let rejectNextRefresh = false;
  let apiKeyRevoked = false;

  const json = (response, status, body, headers = {}) => {
    response.writeHead(status, { "content-type": "application/json", ...headers });
    response.end(JSON.stringify(body));
  };
  const html = (response, body) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
  };

  function issueTokens(response, grant) {
    const accessToken = fakeJwt();
    const refreshToken = randomBytes(24).toString("hex");
    accessTokens.set(accessToken, grant);
    refreshTokens.set(refreshToken, { status: "active", grant });
    issued.push(accessToken, refreshToken);
    json(
      response,
      200,
      { access_token: accessToken, token_type: "bearer", expires_in: 900 },
      {
        "set-cookie": `${REFRESH_COOKIE}=${refreshToken}; HttpOnly; Path=/api/auth; SameSite=Strict; Max-Age=2592000`,
      },
    );
  }

  const GRANT_CHECKS = {
    password: (form) => form.get("username") === STUB_USER.email && form.get("password") === STUB_USER.password,
    api_key: (form) => !apiKeyRevoked && form.get("api_key") === STUB_API_KEY,
  };

  async function tokenGrant(request, response) {
    const form = new URLSearchParams(await readBody(request));
    const grant = form.get("grant_type");
    if (!GRANT_CHECKS[grant]?.(form)) {
      json(response, 400, { detail: { error: "invalid_grant", error_description: "Invalid credentials." } });
      return;
    }
    stats.logins += 1;
    stats.grants[grant] += 1;
    issueTokens(response, grant);
  }

  function refresh(request, response) {
    const token = cookieValue(request, REFRESH_COOKIE);
    const entry = refreshTokens.get(token);
    if (entry?.status === "replaced") stats.replays += 1;
    if (entry?.status !== "active" || rejectNextRefresh) {
      rejectNextRefresh = false;
      json(response, 401, { detail: { error: "invalid_grant", error_description: "Refresh token rejected." } });
      return;
    }
    entry.status = "replaced";
    stats.refreshes += 1;
    issueTokens(response, entry.grant);
  }

  function revokeApiKey() {
    apiKeyRevoked = true;
    for (const [token, grant] of accessTokens) if (grant === "api_key") accessTokens.delete(token);
    for (const [token, entry] of refreshTokens) if (entry.grant === "api_key") refreshTokens.delete(token);
  }

  const isAuthorized = (request) => accessTokens.has((request.headers.authorization ?? "").replace(/^Bearer /, ""));

  async function projectsApi(request, response, path) {
    if (path === "/api/projects") {
      stats.redirects += 1;
      response.writeHead(307, { location: "http://localhost:8000/api/projects/" });
      response.end();
      return;
    }
    if (!isAuthorized(request)) {
      json(response, 401, { detail: "Could not validate credentials" });
      return;
    }
    if (path === "/api/projects/" && request.method === "GET") {
      json(response, 200, { projects: [...projects.values()] });
      return;
    }
    if (path === "/api/projects/" && request.method === "POST") {
      const { name, description } = JSON.parse(await readBody(request));
      const project = makeProject(randomBytes(16).toString("hex"), name, description ?? null);
      projects.set(project.id, project);
      json(response, 201, project);
      return;
    }
    const project = projects.get(decodeURIComponent(path.slice("/api/projects/".length)));
    if (project) json(response, 200, project);
    else json(response, 404, { detail: "Project not found" });
  }

  async function route(request, response) {
    const { pathname } = new URL(request.url, "http://stub");
    if (pathname === "/api/health") json(response, 200, { status: "ok", app: "Крометра", version: "stub" });
    else if (pathname === "/api/auth/token") await tokenGrant(request, response);
    else if (pathname === "/api/auth/refresh") refresh(request, response);
    else if (pathname === "/api/auth/me") {
      if (isAuthorized(request)) json(response, 200, { id: "stub-user", email: STUB_USER.email });
      else json(response, 401, { detail: { error: "invalid_token", error_description: "Token rejected." } });
    }
    else if (pathname.startsWith("/api/projects")) await projectsApi(request, response, pathname);
    else if (pathname.startsWith("/editor/"))
      html(response, editorPage(decodeURIComponent(pathname.slice("/editor/".length))));
    else if (pathname === "/login") html(response, "<!doctype html><title>Вход</title>");
    else if (STATIC_FILES.includes(pathname)) {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(await readFile(new URL(`.${pathname}`, import.meta.url)));
    } else json(response, 404, { detail: "Not Found" });
  }

  const server = createServer((request, response) => {
    route(request, response).catch((error) => json(response, 500, { detail: String(error) }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    stats,
    issued,
    revokeAccessTokens: () => accessTokens.clear(),
    revokeApiKey,
    rejectNextRefresh: () => {
      rejectNextRefresh = true;
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
