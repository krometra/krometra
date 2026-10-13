import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PAGE_MODES, STUB_USER, startStubApp } from "./stub/app.mjs";
import { jsonOf, startMcp, textOf } from "./support/mcp-client.mjs";

const TOOL_NAMES = [
  "cad_list_projects",
  "cad_create_project",
  "cad_open_project",
  "cad_capabilities",
  "cad_state",
  "cad_request",
  "cad_snapshot",
  "cad_export",
];
const UNREACHABLE_URL = "http://127.0.0.1:9";
const CLIENT = { capabilities: {}, clientInfo: { name: "node-test", version: "1" } };

describe("протокол MCP", () => {
  let mcp;

  before(() => {
    mcp = startMcp({ CAD_STUDIO_URL: UNREACHABLE_URL });
  });
  after(() => mcp.stop());

  test("initialize возвращает версию клиента, сведения о сервере и порядок работы", async () => {
    const { result } = await mcp.rpc("initialize", { protocolVersion: "2025-06-18", ...CLIENT });
    assert.equal(result.protocolVersion, "2025-06-18");
    assert.equal(result.serverInfo.name, "cad-studio");
    assert.deepEqual(result.capabilities, { tools: { listChanged: false } });
    assert.match(result.instructions, /cad_open_project/);
    assert.match(result.instructions, /миллиметрах/);
  });

  test("неизвестная версия протокола заменяется последней известной", async () => {
    const { result } = await mcp.rpc("initialize", { protocolVersion: "1999-01-01", ...CLIENT });
    assert.equal(result.protocolVersion, "2025-11-25");
  });

  test("уведомление остаётся без ответа, ping отвечает пустым результатом", async () => {
    const answeredBefore = mcp.responses().length;
    mcp.notify("notifications/initialized");
    const reply = await mcp.rpc("ping");
    assert.deepEqual(reply.result, {});
    assert.equal(mcp.responses().length, answeredBefore + 1);
  });

  test("tools/list отдаёт инструменты с единым префиксом, схемой и описанием", async () => {
    const { result } = await mcp.rpc("tools/list", {});
    assert.deepEqual(
      result.tools.map((tool) => tool.name),
      TOOL_NAMES,
    );
    for (const tool of result.tools) {
      assert.equal(tool.inputSchema.type, "object");
      assert.ok(tool.description.length > 40, `${tool.name}: слишком короткое описание`);
      assert.equal(typeof tool.annotations.readOnlyHint, "boolean");
    }
    const request = result.tools.find((tool) => tool.name === "cad_request");
    assert.deepEqual(request.inputSchema.required, ["op"]);
    assert.match(request.description, /busy/);
    assert.match(request.description, /cad_capabilities/);
  });

  test("неизвестный метод и неизвестный инструмент дают JSON-RPC error", async () => {
    const unknownMethod = await mcp.rpc("resources/list", {});
    assert.equal(unknownMethod.error.code, -32601);
    const unknownTool = await mcp.rpc("tools/call", { name: "cad_nope", arguments: {} });
    assert.equal(unknownTool.error.code, -32602);
  });

  test("битая строка даёт parse error и не роняет сервер", async () => {
    const reply = await mcp.sendRaw("{not json");
    assert.equal(reply.error.code, -32700);
    assert.deepEqual((await mcp.rpc("ping")).result, {});
  });

  test("инструменты редактора до открытия проекта возвращают isError", async () => {
    for (const [name, args] of [
      ["cad_state", {}],
      ["cad_capabilities", {}],
      ["cad_request", { op: "state" }],
      ["cad_snapshot", {}],
    ]) {
      const result = await mcp.callTool(name, args);
      assert.equal(result.isError, true, name);
      assert.match(textOf(result), /cad_open_project/, name);
    }
  });

  test("недоступный адрес приложения возвращается ошибкой инструмента с подсказкой", async () => {
    const result = await mcp.callTool("cad_list_projects");
    assert.equal(result.isError, true);
    assert.match(textOf(result), /нет связи с http:\/\/127\.0\.0\.1:9/);
    assert.deepEqual((await mcp.rpc("ping")).result, {});
  });
});

describe("вход и проекты", () => {
  let stub;
  let mcp;

  before(async () => {
    stub = await startStubApp();
    mcp = startMcp({ CAD_STUDIO_URL: stub.url });
  });
  after(async () => {
    await mcp.stop();
    await stub.close();
  });

  test("список проектов читается по API одним входом и без редиректа мимо прокси", async () => {
    const { projects } = jsonOf(await mcp.callTool("cad_list_projects"));
    assert.deepEqual(
      projects.map((project) => project.id),
      ["ready-project", ...PAGE_MODES],
    );
    assert.deepEqual(Object.keys(projects[0]), ["id", "name", "updated_at"]);
    assert.equal(stub.stats.logins, 1);
    assert.equal(stub.stats.redirects, 0);
  });

  test("созданный проект появляется в списке", async () => {
    const created = jsonOf(await mcp.callTool("cad_create_project", { name: "Кронштейн", description: "Тест MCP" }));
    assert.equal(created.name, "Кронштейн");
    assert.equal(created.description, "Тест MCP");
    const { projects } = jsonOf(await mcp.callTool("cad_list_projects"));
    assert.ok(projects.some((project) => project.id === created.id));
  });

  test("проект без имени отклоняется до запроса к API", async () => {
    const result = await mcp.callTool("cad_create_project", { name: "  " });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /name/);
  });

  test("после протухшего access token сервер входит заново и повторяет запрос", async () => {
    const loginsBefore = stub.stats.logins;
    stub.revokeAccessTokens();
    const result = await mcp.callTool("cad_list_projects");
    assert.notEqual(result.isError, true);
    assert.equal(stub.stats.logins, loginsBefore + 1);
  });

  test("пароль и токены не попадают ни в ответы, ни в stderr", () => {
    const output = mcp.output();
    assert.ok(stub.issued.length >= 2);
    for (const secret of [STUB_USER.password, ...stub.issued]) assert.ok(!output.includes(secret));
  });
});

describe("учётные данные", () => {
  let stub;

  before(async () => {
    stub = await startStubApp();
  });
  after(() => stub.close());

  test("неверный пароль возвращается ошибкой входа без самого пароля", async () => {
    const mcp = startMcp({ CAD_STUDIO_URL: stub.url, CAD_STUDIO_PASSWORD: "wrong-pass-456" });
    const result = await mcp.callTool("cad_list_projects");
    assert.equal(result.isError, true);
    assert.match(textOf(result), /Вход не удался \(400\): invalid_grant/);
    assert.equal(await mcp.stop(), 0);
    assert.ok(!mcp.output().includes("wrong-pass-456"));
  });

  test("без email и пароля сервер стартует, а инструмент называет недостающие переменные", async () => {
    const mcp = startMcp({ CAD_STUDIO_URL: stub.url, CAD_STUDIO_EMAIL: "", CAD_STUDIO_PASSWORD: "" });
    const result = await mcp.callTool("cad_list_projects");
    assert.equal(result.isError, true);
    assert.match(textOf(result), /CAD_STUDIO_EMAIL, CAD_STUDIO_PASSWORD/);
    assert.equal(await mcp.stop(), 0);
  });
});
