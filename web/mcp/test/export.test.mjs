import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { ToolError } from "../errors.mjs";
import { resolveTarget } from "../export.mjs";
import { startStubApp } from "./stub/app.mjs";
import { BODY_ID, stubExportFile } from "./stub/model.mjs";
import { jsonOf, startMcp, textOf } from "./support/mcp-client.mjs";

const expectedBytes = (format, bodyIds) => Buffer.from(stubExportFile(format, bodyIds).bytes);

describe("цель экспорта на диске", () => {
  let root;

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "cad-mcp-target-"));
    await mkdir(path.join(root, "v1.2"));
  });
  after(() => rm(root, { recursive: true, force: true }));

  test("путь с расширением формата - файл, в том числе .stp и расширение в верхнем регистре", async () => {
    assert.deepEqual(await resolveTarget("/out/part.stl", "stl"), { file: "/out/part.stl" });
    assert.deepEqual(await resolveTarget("/out/part.stp", "step"), { file: "/out/part.stp" });
    assert.deepEqual(await resolveTarget("/out/PART.STEP", "step"), { file: "/out/PART.STEP" });
  });

  test("путь со слэшем в конце, без расширения или существующий каталог - каталог", async () => {
    assert.deepEqual(await resolveTarget("/out/parts.v2/", "stl"), { directory: "/out/parts.v2" });
    assert.deepEqual(await resolveTarget("/out/parts", "stl"), { directory: "/out/parts" });
    assert.deepEqual(await resolveTarget(path.join(root, "v1.2"), "stl"), { directory: path.join(root, "v1.2") });
  });

  test("путь от домашнего каталога раскрывается", async () => {
    assert.deepEqual(await resolveTarget("~/models/part.stl", "stl"), {
      file: path.join(homedir(), "models/part.stl"),
    });
  });

  test("относительный путь и чужое расширение отклоняются", async () => {
    await assert.rejects(resolveTarget("models/part.stl", "stl"), ToolError);
    await assert.rejects(resolveTarget("/out/part.step", "stl"), /\.step не подходит формату stl: ожидается \.stl/);
  });
});

describe("экспорт модели в файл", () => {
  let stub;
  let mcp;
  let root;

  const exportTo = (args) => mcp.callTool("cad_export", args);
  const request = (op, params) => mcp.callTool("cad_request", { op, params });
  const exportCount = async () => jsonOf(await request("stub.stats")).result.exports;

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "cad-mcp-export-"));
    stub = await startStubApp();
    mcp = startMcp({ CAD_STUDIO_URL: stub.url });
    const opened = await mcp.callTool("cad_open_project", { project_id: "ready-project" });
    assert.notEqual(opened.isError, true, textOf(opened));
  });
  after(async () => {
    await mcp.stop();
    await stub.close();
    await rm(root, { recursive: true, force: true });
  });

  test("экспорт в файл: байты канала записаны как есть, в ответе путь, размер, mime и имя из канала", async () => {
    const file = path.join(root, "single", "part.stl");
    const result = await exportTo({ format: "stl", path: file });
    assert.notEqual(result.isError, true, textOf(result));
    const expected = expectedBytes("stl");
    assert.deepEqual(jsonOf(result), {
      path: file,
      bytes: expected.length,
      mime: "model/stl",
      filename: "stub-project.stl",
    });
    assert.ok((await readFile(file)).equals(expected));
    assert.equal(result.content.length, 1);
  });

  test("экспорт в каталог: каталог создаётся, имя файла берётся из канала", async () => {
    const directory = path.join(root, "nested", "out");
    const result = await exportTo({ format: "step", path: `${directory}/` });
    assert.notEqual(result.isError, true, textOf(result));
    const written = jsonOf(result);
    assert.equal(written.path, path.join(directory, "stub-project.step"));
    assert.equal(written.mime, "application/step");
    assert.ok((await readFile(written.path)).equals(expectedBytes("step")));
  });

  test("body_ids уходят в канал как bodyIds: отдельный файл на тело", async () => {
    const directory = path.join(root, "per-body");
    const written = jsonOf(await exportTo({ format: "stl", path: directory, body_ids: [BODY_ID] }));
    assert.equal(written.filename, `stub-project-${BODY_ID}.stl`);
    assert.equal(written.path, path.join(directory, `stub-project-${BODY_ID}.stl`));
    assert.ok((await readFile(written.path)).equals(expectedBytes("stl", [BODY_ID])));
  });

  test("существующий файл не перезаписывается без overwrite, а отказ приходит до вызова канала", async () => {
    const file = path.join(root, "keep.stl");
    await exportTo({ format: "stl", path: file });
    const exportsBefore = await exportCount();
    const refused = await exportTo({ format: "stl", path: file, body_ids: [BODY_ID] });
    assert.equal(refused.isError, true);
    assert.match(textOf(refused), /уже существует: передай overwrite: true/);
    assert.equal(await exportCount(), exportsBefore);
    assert.ok((await readFile(file)).equals(expectedBytes("stl")));
  });

  test("в каталоге существующий файл с именем из канала тоже не перезаписывается", async () => {
    const directory = path.join(root, "occupied");
    await mkdir(directory);
    await writeFile(path.join(directory, "stub-project.stl"), "мой файл");
    const refused = await exportTo({ format: "stl", path: directory });
    assert.equal(refused.isError, true);
    assert.match(textOf(refused), /stub-project\.stl уже существует/);
    assert.equal(await readFile(path.join(directory, "stub-project.stl"), "utf8"), "мой файл");
  });

  test("overwrite: true заменяет существующий файл", async () => {
    const file = path.join(root, "replace.stl");
    await exportTo({ format: "stl", path: file });
    const result = await exportTo({ format: "stl", path: file, body_ids: [BODY_ID], overwrite: true });
    assert.notEqual(result.isError, true, textOf(result));
    assert.ok((await readFile(file)).equals(expectedBytes("stl", [BODY_ID])));
  });

  test("имя файла из канала с путём наружу не выводит запись за пределы каталога", async () => {
    const directory = path.join(root, "jail", "inner");
    await request("stub.exportName", { filename: "../../escape/evil.stl" });
    const written = jsonOf(await exportTo({ format: "stl", path: `${directory}/` }));
    await request("stub.exportName", { filename: null });
    assert.equal(written.path, path.join(directory, "evil.stl"));
    assert.deepEqual(await readdir(path.join(root, "jail")), ["inner"]);
    assert.deepEqual(await readdir(directory), ["evil.stl"]);
  });

  test("неверные параметры отклоняются до вызова канала", async () => {
    const exportsBefore = await exportCount();
    const cases = [
      [{ format: "obj", path: root }, /format: допустимо stl \| step/],
      [{ path: root }, /format: допустимо stl \| step/],
      [{ format: "stl" }, /path обязателен/],
      [{ format: "stl", path: "relative/part.stl" }, /абсолютным путём/],
      [{ format: "stl", path: path.join(root, "part.step") }, /не подходит формату stl/],
      [{ format: "stl", path: root, body_ids: [] }, /body_ids: непустой массив id/],
      [{ format: "stl", path: root, body_ids: "body-1" }, /body_ids: непустой массив id/],
    ];
    for (const [args, message] of cases) {
      const result = await exportTo(args);
      assert.equal(result.isError, true, JSON.stringify(args));
      assert.match(textOf(result), message);
    }
    assert.equal(await exportCount(), exportsBefore);
  });

  test("ошибка канала возвращается ошибкой инструмента, файл не создаётся", async () => {
    const directory = path.join(root, "missing-body");
    const result = await exportTo({ format: "stl", path: `${directory}/`, body_ids: ["body-404"] });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /export: not_found - В документе нет тел: body-404/);
    await assert.rejects(readdir(directory), { code: "ENOENT" });
  });

  test("cad_request export не тащит base64 в ответ и не выдаёт файл за картинку", async () => {
    const result = await request("export", { format: "stl" });
    assert.notEqual(result.isError, true);
    assert.deepEqual(
      result.content.map((block) => block.type),
      ["text"],
    );
    const reply = jsonOf(result);
    assert.deepEqual(
      { ok: reply.ok, op: reply.op, mime: reply.result.mime, filename: reply.result.filename },
      { ok: true, op: "export", mime: "model/stl", filename: "stub-project.stl" },
    );
    assert.match(reply.result.dataBase64, /это не изображение.*cad_export/);
    assert.ok(!textOf(result).includes(expectedBytes("stl").toString("base64")));
  });
});
