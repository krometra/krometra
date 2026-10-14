import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { STUB_API_KEY, startStubApp } from "./stub/app.mjs";
import { BODY_ID, CANVAS, HOME_TARGET, boxTopology, projectPoint } from "./stub/model.mjs";
import { imageOf, jsonOf, startMcp, textOf } from "./support/mcp-client.mjs";
import { decodePng } from "./support/png.mjs";

const READY_PROJECT = "ready-project";
const READY_TIMEOUT_MS = 2500;
const ACCENT = [255, 59, 107];
const BACKGROUND = [32, 38, 46];
const IMAGE = { width: CANVAS.width * CANVAS.pixelRatio, height: CANVAS.height * CANVAS.pixelRatio };
const DRIFT_MM = 5;

const isAccent = (red, green, blue) => red === ACCENT[0] && green === ACCENT[1] && blue === ACCENT[2];
const isBright = (red, green, blue) => red > 200 && green > 200 && blue > 200;

function imagePixel(point, target = HOME_TARGET) {
  const [clientX, clientY] = projectPoint(point, target);
  return [
    Math.round((clientX - CANVAS.left) * CANVAS.pixelRatio),
    Math.round((clientY - CANVAS.top) * CANVAS.pixelRatio),
  ];
}

describe("редактор через канал управления", () => {
  let stub;
  let mcp;

  const open = (projectId = READY_PROJECT) => mcp.callTool("cad_open_project", { project_id: projectId });
  const request = (op, params) => mcp.callTool("cad_request", { op, params });
  const captureCount = async () => jsonOf(await request("stub.stats")).result.captures;

  before(async () => {
    stub = await startStubApp();
    mcp = startMcp({ CAD_STUDIO_URL: stub.url, CAD_STUDIO_READY_TIMEOUT_MS: String(READY_TIMEOUT_MS) });
  });
  after(async () => {
    await mcp.stop();
    await stub.close();
  });

  test("cad_open_project дожидается cadControl.ready и сообщает версию канала", async () => {
    const result = await open();
    assert.notEqual(result.isError, true, textOf(result));
    const opened = jsonOf(result);
    assert.equal(opened.project.id, READY_PROJECT);
    assert.equal(opened.url, `${stub.url}/editor/${READY_PROJECT}`);
    assert.equal(opened.channelVersion, 1);
  });

  test("cad_open_project принимает ссылку на редактор", async () => {
    const opened = jsonOf(await open(`${stub.url}/editor/${READY_PROJECT}`));
    assert.equal(opened.project.id, READY_PROJECT);
  });

  test("несуществующий проект отклоняется до запуска страницы", async () => {
    const result = await open("missing-project");
    assert.equal(result.isError, true);
    assert.match(textOf(result), /missing-project не найден/);
  });

  test("cad_capabilities возвращает операции канала с параметрами", async () => {
    await open();
    const capabilities = jsonOf(await mcp.callTool("cad_capabilities"));
    assert.equal(capabilities.version, 1);
    const topology = capabilities.ops.find((entry) => entry.op === "topology");
    assert.deepEqual(topology.params.bodyId, { type: "string", required: true, description: "id тела" });
    assert.equal(capabilities.ops.find((entry) => entry.op === "stub.extrude").mutates, true);
  });

  test("cad_state возвращает состояние открытого проекта", async () => {
    await open();
    const state = jsonOf(await mcp.callTool("cad_state"));
    assert.equal(state.projectId, READY_PROJECT);
    assert.deepEqual(state.bodies, [{ id: BODY_ID, name: "Тело 1", visible: true }]);
    assert.equal(state.busy, false);
  });

  test("cad_request передаёт op и params в канал и возвращает ответ как есть", async () => {
    await open();
    const result = await request("topology", { bodyId: BODY_ID });
    assert.notEqual(result.isError, true);
    assert.deepEqual(jsonOf(result), { ok: true, op: "topology", result: boxTopology() });
  });

  test("мутирующая операция меняет состояние, видимое через cad_state", async () => {
    await open();
    const reply = jsonOf(await request("stub.extrude", { distance: 12 }));
    assert.deepEqual(reply, { ok: true, op: "stub.extrude", result: { bodyId: "body-2" } });
    const state = jsonOf(await mcp.callTool("cad_state"));
    assert.equal(state.document.version, 2);
    assert.equal(state.bodies.length, 2);
  });

  test("вторая мутация во время первой получает busy с подсказкой повторить", async () => {
    await open();
    const results = await Promise.all([
      request("stub.extrude", { distance: 5 }),
      request("stub.extrude", { distance: 7 }),
    ]);
    const rejected = results.find((result) => result.isError);
    assert.equal(results.filter((result) => !result.isError).length, 1);
    assert.equal(jsonOf(rejected).error.code, "busy");
    assert.match(textOf(rejected, 1), /повтори вызов/);
  });

  test("ошибки канала возвращаются как есть и помечаются isError", async () => {
    await open();
    const cases = [
      ["stub.nope", undefined, "unknown_op"],
      ["topology", {}, "invalid_params"],
      ["topology", { bodyId: "body-404" }, "not_found"],
      ["sketch.get", undefined, "wrong_mode"],
      ["stub.fail", undefined, "operation_failed"],
    ];
    for (const [op, params, code] of cases) {
      const result = await request(op, params);
      const reply = jsonOf(result);
      assert.equal(result.isError, true, op);
      assert.deepEqual({ ok: reply.ok, op: reply.op, code: reply.error.code }, { ok: false, op, code });
      assert.equal(typeof reply.error.message, "string");
      assert.ok(textOf(result, 1).length > 0, `${code}: нет подсказки`);
    }
    assert.deepEqual(jsonOf(await request("state")).ok, true);
  });

  test("params не объектом отклоняется до вызова канала", async () => {
    await open();
    const result = await request("topology", "body-1");
    assert.equal(result.isError, true);
    assert.match(textOf(result), /params должен быть объектом/);
  });

  test("viewport.capture через cad_request отдаёт картинку отдельным блоком, а не base64 в тексте", async () => {
    await open();
    const result = await request("viewport.capture");
    const reply = jsonOf(result);
    assert.equal(reply.result.mime, "image/png");
    assert.match(reply.result.dataBase64, /вынесено в изображение/);
    assert.equal(decodePng(imageOf(result).data).width, IMAGE.width);
  });

  test("cad_snapshot без подписей возвращает снимок вьюпорта как image-контент", async () => {
    await open();
    const result = await mcp.callTool("cad_snapshot");
    const block = imageOf(result);
    assert.equal(block.mimeType, "image/png");
    assert.equal(result.content.length, 1);
    const picture = decodePng(block.data);
    assert.deepEqual({ width: picture.width, height: picture.height }, IMAGE);
    assert.equal(picture.count(isAccent), 0);
  });

  test("cad_snapshot подписывает рёбра: метки стоят в проекциях середин рёбер, id и концы есть в легенде", async () => {
    await open();
    const result = await mcp.callTool("cad_snapshot", { labels: "edges" });
    assert.notEqual(result.isError, true, textOf(result));
    const legend = jsonOf(result);
    const { edges } = boxTopology();
    assert.deepEqual(
      {
        bodyId: legend.bodyId,
        kind: legend.kind,
        units: legend.units,
        image: legend.image,
        labeled: legend.labeled,
        offscreen: legend.offscreen,
      },
      { bodyId: BODY_ID, kind: "edges", units: "mm", image: IMAGE, labeled: edges.length, offscreen: 0 },
    );
    assert.equal(legend.notes, undefined);
    assert.deepEqual(
      legend.items.map((item) => item.id),
      edges.map((edge) => edge.id),
    );

    const picture = decodePng(imageOf(result).data);
    assert.deepEqual({ width: picture.width, height: picture.height }, IMAGE);
    edges.forEach((edge, index) => {
      const item = legend.items[index];
      assert.deepEqual({ start: item.start, end: item.end }, { start: edge.start, end: edge.end });
      assert.deepEqual(item.at, imagePixel(edge.midpoint), edge.id);
      assert.deepEqual(picture.pixel(...item.at), ACCENT, `метка ${edge.id} не на месте`);
    });
    assert.deepEqual(picture.pixel(4, 4), BACKGROUND);
    assert.ok(picture.count(isBright) > 200, "на снимке нет текста подписей");
  });

  test("cad_snapshot подписывает грани номерами в точке на грани, id и нормаль отдаёт в легенде", async () => {
    await open();
    const result = await mcp.callTool("cad_snapshot", { labels: "faces", body_id: BODY_ID, label_text: "number" });
    const legend = jsonOf(result);
    const { faces } = boxTopology();
    assert.deepEqual(
      legend.items.map((item) => item.label),
      faces.map((_, index) => String(index + 1)),
    );
    assert.deepEqual(
      legend.items.map((item) => item.id),
      faces.map((face) => face.id),
    );
    const picture = decodePng(imageOf(result).data);
    faces.forEach((face, index) => {
      const item = legend.items[index];
      assert.deepEqual({ point: item.point, normal: item.normal }, { point: face.point, normal: face.normal });
      assert.deepEqual(item.at, imagePixel(face.point));
      assert.deepEqual(picture.pixel(...item.at), ACCENT);
    });
  });

  test("снимок переснимается, если камера сдвинулась между проекцией и съёмкой", async () => {
    await open();
    const capturesBefore = await captureCount();
    await request("stub.drift", { captures: 1 });
    const legend = jsonOf(await mcp.callTool("cad_snapshot", { labels: "edges" }));
    const [edge] = boxTopology().edges;
    assert.equal(await captureCount(), capturesBefore + 2);
    assert.equal(legend.notes, undefined);
    assert.deepEqual(legend.items[0].at, imagePixel(edge.midpoint, [DRIFT_MM, 0, 0]));
  });

  test("если камера не успокаивается, легенда предупреждает о возможном смещении подписей", async () => {
    await open();
    await request("stub.drift", { captures: 9 });
    const legend = jsonOf(await mcp.callTool("cad_snapshot", { labels: "edges" }));
    assert.match(legend.notes.join(" "), /камера двигалась/);
  });

  test("подписи для неизвестного тела возвращают ошибку канала", async () => {
    await open();
    const result = await mcp.callTool("cad_snapshot", { labels: "edges", body_id: "body-404" });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /topology: not_found/);
  });

  test("скрытое тело не мешает выбрать единственное видимое, а при двух видимых нужен body_id", async () => {
    await open();
    await request("stub.extrude", { distance: 3 });
    const single = await mcp.callTool("cad_snapshot", { labels: "faces" });
    assert.notEqual(single.isError, true, textOf(single));
    await request("stub.extrude", { distance: 3, visible: true });
    const ambiguous = await mcp.callTool("cad_snapshot", { labels: "faces" });
    assert.equal(ambiguous.isError, true);
    assert.match(textOf(ambiguous), /Укажи body_id: видимых тел 2/);
    assert.match(textOf(ambiguous), /body-2 \(Тело 2, скрыто\), body-3 \(Тело 3\)/);
  });

  test("неизвестное значение labels отклоняется с перечнем допустимых", async () => {
    await open();
    const result = await mcp.callTool("cad_snapshot", { labels: "vertices" });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /none \| edges \| faces/);
  });

  test("таймаут готовности: ready не разрешился, сервер жив и принимает следующий вызов", async () => {
    const startedAt = Date.now();
    const result = await open("never-ready");
    assert.equal(result.isError, true);
    assert.match(textOf(result), /cadControl\.ready не разрешился за 2\.5 с/);
    assert.ok(Date.now() - startedAt >= READY_TIMEOUT_MS - 600);
    const state = await mcp.callTool("cad_state");
    assert.equal(state.isError, true);
    assert.match(textOf(state), /cad_open_project/);
    assert.notEqual((await open()).isError, true);
  });

  test("перезагрузка страницы до готовности (vite пересобрал зависимости) не срывает открытие", async () => {
    const refreshesBefore = stub.stats.refreshes;
    const result = await open("reload-once");
    assert.notEqual(result.isError, true, textOf(result));
    assert.equal(stub.stats.refreshes, refreshesBefore + 2);
    assert.equal(jsonOf(await mcp.callTool("cad_state")).projectId, "reload-once");
  });

  test("страница без канала управления: понятная ошибка про window.cadControl", async () => {
    const result = await open("no-channel");
    assert.equal(result.isError, true);
    assert.match(textOf(result), /не появился window\.cadControl/);
  });

  test("отклонённая сессия браузера: ошибка про страницу входа, повторное открытие входит заново", async () => {
    await open();
    const loginsBefore = stub.stats.logins;
    stub.rejectNextRefresh();
    const rejected = await open();
    assert.equal(rejected.isError, true);
    assert.match(textOf(rejected), /страницу входа.*CAD_STUDIO_API_KEY не отозван/);
    const reopened = await open();
    assert.notEqual(reopened.isError, true, textOf(reopened));
    assert.equal(stub.stats.logins, loginsBefore + 1);
  });

  test("refresh-токен браузера ни разу не предъявлен повторно", () => {
    assert.ok(stub.stats.refreshes > 10);
    assert.equal(stub.stats.replays, 0);
  });

  test("ключ и токены не попадают ни в ответы, ни в stderr", () => {
    const output = mcp.output();
    assert.match(output, /browser started/);
    for (const secret of [STUB_API_KEY, ...stub.issued]) assert.ok(!output.includes(secret));
  });

  test("закрытие stdin закрывает браузер и завершает сервер с кодом 0", async () => {
    assert.equal(await mcp.stop(), 0);
  });
});
