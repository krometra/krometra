import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { WebSocket } from "ws";
import { startRemoteServer } from "../remote/server.mjs";
import { STUB_API_KEY, STUB_USER, startStubApp } from "./stub/app.mjs";

const STEP_TEXT = "ISO-10303-21;\nEND-ISO-10303-21;\n";
const CLIENT = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "node-test", version: "1" } };

function waitForMessage(socket, type) {
  return new Promise((resolve) => {
    const listener = (data) => {
      const message = JSON.parse(String(data));
      if (message.type !== type) return;
      socket.off("message", listener);
      resolve(message);
    };
    socket.on("message", listener);
  });
}

async function connectTab(base, token, projectId) {
  const socket = new WebSocket(`${base.replace("http", "ws")}/mcp/ws`);
  const imported = [];
  socket.on("message", (data) => {
    const message = JSON.parse(String(data));
    if (message.type !== "request") return;
    const { op, params } = message.request;
    const results = {
      state: { projectId, mode: "model", bodies: [] },
      export: { mime: "application/step", filename: "Плата.step", dataBase64: Buffer.from(STEP_TEXT).toString("base64") },
      "import.step": () => {
        imported.push({ fileName: params.fileName, text: Buffer.from(params.dataBase64, "base64").toString("utf8") });
        return { bodyIds: ["body-000000000001"] };
      },
    };
    const result = typeof results[op] === "function" ? results[op]() : results[op];
    const reply = result ? { ok: true, op, result } : { ok: false, op, error: { code: "unknown_op", message: op } };
    socket.send(JSON.stringify({ type: "reply", id: message.id, reply }));
  });
  await new Promise((resolve) => socket.once("open", resolve));
  const welcome = waitForMessage(socket, "welcome");
  socket.send(JSON.stringify({ type: "hello", token, projectId, channelVersion: 1 }));
  await welcome;
  return { socket, imported };
}

describe("удалённый MCP-сервер", () => {
  let stub;
  let server;
  let base;
  let accessToken;
  let projectId;
  let sessionId = null;
  let nextId = 1;

  async function rpc(method, params, headers = {}) {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${STUB_API_KEY}`, ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}), ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    });
    sessionId = response.headers.get("mcp-session-id") ?? sessionId;
    return { status: response.status, body: response.status === 202 ? null : await response.json() };
  }

  async function callTool(name, args = {}) {
    const { body } = await rpc("tools/call", { name, arguments: args });
    return { ...body.result, json: () => JSON.parse(body.result.content[0].text) };
  }

  before(async () => {
    stub = await startStubApp();
    server = await startRemoteServer(
      { port: 0, host: "127.0.0.1", backendUrl: stub.url, publicUrl: "https://cad.example", openTimeoutMs: 1500, requestTimeoutMs: 5000 },
      () => {},
    );
    base = `http://127.0.0.1:${server.port}`;
    const form = new URLSearchParams({ grant_type: "password", username: STUB_USER.email, password: STUB_USER.password });
    accessToken = (await (await fetch(`${stub.url}/api/auth/token`, { method: "POST", body: form })).json()).access_token;
    await rpc("initialize", CLIENT);
    projectId = (await callTool("cad_list_projects")).json().projects[0].id;
  });

  after(async () => {
    await server.close();
    await stub.close();
  });

  test("без ключа в заголовке отвечает 401, с неизвестной сессией — 404", async () => {
    const anonymous = await fetch(`${base}/mcp`, { method: "POST", body: "{}" });
    assert.equal(anonymous.status, 401);
    const lost = await rpc("tools/list", {}, { "Mcp-Session-Id": "lost-session" });
    assert.equal(lost.status, 404);
  });

  test("инициализация выдаёт сессию, уведомление получает 202", async () => {
    assert.ok(sessionId);
    assert.equal((await rpc("notifications/initialized")).status, 202);
  });

  test("без открытой вкладки cad_open_project просит открыть ссылку", async () => {
    const result = await callTool("cad_open_project", { project_id: projectId });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, new RegExp(`https://cad.example/editor/${projectId}`));
  });

  test("вкладка с чужим токеном не подключается", async () => {
    const socket = new WebSocket(`${base.replace("http", "ws")}/mcp/ws`);
    await new Promise((resolve) => socket.once("open", resolve));
    const rejected = waitForMessage(socket, "rejected");
    socket.send(JSON.stringify({ type: "hello", token: "forged", projectId }));
    assert.match((await rejected).reason, /Вход не подтверждён/);
  });

  test("команды уходят во вкладку пользователя, она видит подключение агента", async () => {
    const tab = await connectTab(base, accessToken, projectId);
    const attached = waitForMessage(tab.socket, "session");
    const opened = (await callTool("cad_open_project", { project_id: projectId })).json();
    assert.equal(opened.url, `https://cad.example/editor/${projectId}`);
    assert.equal((await attached).attached, true);
    const state = (await callTool("cad_state")).json();
    assert.equal(state.projectId, projectId);

    const exported = (await callTool("cad_export", { format: "step" })).json();
    assert.match(exported.url, /^https:\/\/cad\.example\/mcp\/files\//);
    const download = await fetch(`${base}${new URL(exported.url).pathname}`);
    assert.equal(await download.text(), STEP_TEXT);
    assert.match(download.headers.get("content-disposition"), /filename\*=UTF-8''%D0%9F/);

    const slot = (await callTool("cad_import")).json();
    const put = await fetch(`${base}${new URL(slot.upload).pathname}`, { method: "PUT", body: STEP_TEXT, headers: { "X-File-Name": "board.step" } });
    assert.equal(put.status, 200);
    const imported = (await callTool("cad_import", { upload_id: slot.uploadId })).json();
    assert.deepEqual(imported.result.bodyIds, ["body-000000000001"]);
    assert.deepEqual(tab.imported, [{ fileName: "board.step", text: STEP_TEXT }]);
    const reused = await callTool("cad_import", { upload_id: slot.uploadId });
    assert.equal(reused.isError, true);
    tab.socket.close();
  });
});
