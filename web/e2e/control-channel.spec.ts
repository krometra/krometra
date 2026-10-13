import { expect, test, type Page } from "@playwright/test";
import { CadEditor } from "./helpers/cad";
import {
  channelKinds,
  circle,
  errorCode,
  isVertical,
  near,
  readStl,
  rect,
  sceneBodies,
  type ExportedFile,
  type Feature,
  type Topo,
} from "./helpers/control";

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1680, height: 1000 },
});

const PARAM_TYPES = ["string", "number", "integer", "boolean", "array", "object"];
const REQUIRED_OPS = [
  "capabilities",
  "state",
  "topology",
  "camera.get",
  "camera.set",
  "viewport.project",
  "viewport.capture",
  "sketch.get",
  "sketch.project",
  "export",
  "sketch.create",
  "extrude",
  "revolve",
  "fillet",
  "chamfer",
  "boolean",
  "thread",
  "history.undo",
  "history.redo",
];

function recordReadyEvents(page: Page) {
  return page.addInitScript(() => {
    const seen: boolean[] = [];
    (window as unknown as { cadReadyEvents: boolean[] }).cadReadyEvents = seen;
    window.addEventListener("cad-control-ready", () => seen.push(Boolean(window.cadControl)));
  });
}

test("канал публикуется редактором, сообщает готовность и описывает себя", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const pageErrors: string[] = [];
  const pageTokens = new Set<string>();
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("request", (request) => {
    const header = request.headers()["authorization"];
    if (header) pageTokens.add(header.replace(/^Bearer\s+/i, ""));
  });
  await recordReadyEvents(page);

  const cad = await CadEditor.open(page, "e2e-control-read");

  expect(await page.evaluate(() => window.cadControl!.version)).toBe(1);
  expect(
    await page.evaluate(() => (window as unknown as { cadReadyEvents: boolean[] }).cadReadyEvents),
    "событие готовности пришло один раз, канал к этому моменту опубликован",
  ).toEqual([true]);
  const state = await cad.control<Record<string, any>>("state");
  expect(state).toMatchObject({
    projectId: cad.projectId,
    mode: "model",
    ready: true,
    kernel: "ready",
    document: { dirty: false },
    bodies: [],
    sketches: [],
    timeline: [],
    busy: false,
  });
  expect(typeof state.document.version).toBe("number");

  const capabilities = await cad.control<{
    version: number;
    ops: { op: string; description: string; mutates: boolean; params: Record<string, { type: string; required: boolean; description: string }> }[];
  }>("capabilities");
  expect(capabilities.version).toBe(1);
  const names = capabilities.ops.map((entry) => entry.op);
  for (const op of REQUIRED_OPS) expect(names, `операция ${op} объявлена`).toContain(op);
  expect(new Set(names).size).toBe(names.length);
  for (const entry of capabilities.ops) {
    expect(entry.description.length, `описание ${entry.op} содержательное`).toBeGreaterThan(40);
    expect(typeof entry.mutates).toBe("boolean");
    for (const [name, spec] of Object.entries(entry.params)) {
      expect(Object.keys(spec).sort(), `${entry.op}.${name}`).toEqual(["description", "required", "type"]);
      expect(PARAM_TYPES, `${entry.op}.${name}`).toContain(spec.type);
      expect(spec.description.length, `${entry.op}.${name}`).toBeGreaterThan(10);
    }
  }
  const mutating = capabilities.ops.filter((entry) => entry.mutates).map((entry) => entry.op);
  expect(mutating).toEqual(expect.arrayContaining(["sketch.create", "extrude", "fillet", "history.undo"]));
  for (const op of ["capabilities", "state", "topology", "camera.get", "camera.set", "viewport.project", "viewport.capture", "sketch.get", "export"]) {
    expect(mutating, `${op} не меняет модель`).not.toContain(op);
  }

  expect(await errorCode(cad, "teleport")).toBe("unknown_op");
  expect(await errorCode(cad, "topology")).toBe("invalid_params");
  expect(await errorCode(cad, "topology", { bodyId: "no-such-body" })).toBe("not_found");
  expect(await errorCode(cad, "camera.set", { position: [1, 2] })).toBe("invalid_params");
  expect(await errorCode(cad, "state", { verbose: true })).toBe("invalid_params");
  expect(await errorCode(cad, "sketch.addEntities", { entities: [circle(0, 0, 5)] })).toBe("wrong_mode");
  expect(await errorCode(cad, "sketch.project", { points: [[0, 0]] })).toBe("wrong_mode");
  expect(await errorCode(cad, "extrude", { sketchId: "no-such-sketch", distance: 5 })).toBe("not_found");
  expect(await errorCode(cad, "history.undo")).toBe("operation_failed");
  expect(await errorCode(cad, "export", { format: "stl" }), "в пустом проекте экспортировать нечего").toBe("operation_failed");
  expect(await page.evaluate(() => window.cadControl!.request(null as never)), "битый запрос не роняет канал").toMatchObject({
    ok: false,
    op: "",
    error: { code: "invalid_params" },
  });

  const moved = await cad.control<{ position: number[]; target: number[]; up: number[] }>("camera.set", {
    position: [80, -60, 50],
    target: [0, 0, 5],
  });
  expect(moved.target).toEqual([0, 0, 5]);
  expect(moved.up).toEqual([0, 0, 1]);
  moved.position.forEach((value, index) => expect(value).toBeCloseTo([80, -60, 50][index], 3));

  const live = await cad.control<{ points: { x: number; y: number; inside: boolean }[]; canvas: { left: number; top: number; width: number; height: number } }>(
    "viewport.project",
    { points: [[0, 0, 5], [0, 0, 25]] },
  );
  expect(live.canvas.width).toBeGreaterThan(300);
  expect(live.points[0].x).toBeCloseTo(live.canvas.left + live.canvas.width / 2, 0);
  expect(live.points[0].y).toBeCloseTo(live.canvas.top + live.canvas.height / 2, 0);
  expect(live.points[1].y, "выше по Z — выше на экране").toBeLessThan(live.points[0].y);

  const imagined = await cad.control<{ points: { x: number; y: number }[] }>("viewport.project", {
    points: [[10, 0, 0]],
    camera: { position: [0, 0, 120], target: [0, 0, 0], up: [0, 1, 0] },
  });
  expect(imagined.points[0].x, "вид сверху: +X вправо от центра").toBeGreaterThan(live.canvas.left + live.canvas.width / 2);
  const afterProbe = await cad.cameraState();
  afterProbe.position.forEach((value, index) =>
    expect(value, "гипотетический ракурс не двигает камеру").toBeCloseTo(moved.position[index], 6),
  );

  const shot = await cad.control<{ mime: string; dataBase64: string; width: number; height: number }>("viewport.capture", {
    width: 320,
    height: 200,
  });
  expect(shot).toMatchObject({ mime: "image/png", width: 320, height: 200 });
  expect(shot.dataBase64.startsWith("iVBORw0KGgo")).toBe(true);
  expect(shot.dataBase64.length).toBeGreaterThan(500);

  const everything = JSON.stringify([
    state,
    capabilities,
    await cad.control("sketch.get"),
    await cad.control("selection.get"),
    await cad.control("scene.get"),
  ]);
  expect(pageTokens.size, "страница ходила в API с токеном").toBeGreaterThan(0);
  for (const token of pageTokens) expect(everything.includes(token), "канал не отдаёт access token").toBe(false);
  expect(everything).not.toMatch(/access_token|refresh_token|authorization/i);

  expect(await cad.control("viewport.setHelpers", { grid: false })).toEqual({ grid: false, sketchOutlines: true });
  expect(await cad.control("viewport.setHelpers", { grid: true, sketchOutlines: false })).toEqual({ grid: true, sketchOutlines: false });

  await page.getByText("Мои проекты").first().click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => window.cadControl === undefined), "вне редактора канала нет").toBe(true);
  await page.goBack();
  await cad.install();
  expect((await cad.control<{ projectId: string; ready: boolean }>("state"))).toMatchObject({ projectId: cad.projectId, ready: true });
  expect(
    await page.evaluate(() => (window as unknown as { cadReadyEvents: boolean[] }).cadReadyEvents),
    "новый редактор — новый канал и новое событие готовности",
  ).toEqual([true, true]);

  expect(pageErrors).toEqual([]);
});

test("канал строит деталь без кликов: эскиз, выдавливание, вырез, фаска, скругление, отмена", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const cad = await CadEditor.open(page, "e2e-control-model");

  const base = await cad.control<{ sketchId: string; mode: string }>("sketch.create", {
    plane: "XY",
    entities: [rect(-20, -20, 20, 20)],
  });
  expect(base.mode).toBe("model");

  const racing = await page.evaluate((sketchId) => {
    const channel = window.cadControl!;
    return Promise.all([
      channel.request({ op: "extrude", params: { sketchId, distance: 10 } }),
      channel.request({ op: "history.undo" }),
      channel.request({ op: "state" }),
    ]);
  }, base.sketchId);
  expect(racing[0].ok, "первая мутирующая операция выполняется").toBe(true);
  expect(racing[1], "вторая во время первой получает busy").toMatchObject({ ok: false, error: { code: "busy" } });
  expect(racing[2], "чтение во время операции проходит и видит занятость").toMatchObject({ ok: true, result: { busy: true } });

  const box = (racing[0] as { result: Feature }).result;
  expect(box.feature).toMatchObject({ kind: "extrude", status: "ok" });
  expect(box.mode).toBe("model");
  expect(await sceneBodies(cad), "результат в сцене сразу, без перезагрузки").toEqual([box.feature.bodyId]);

  const boxTopo = await cad.control<Topo>("topology", { bodyId: box.feature.bodyId });
  expect(boxTopo.faces).toHaveLength(6);
  expect(boxTopo.edges).toHaveLength(12);
  expect(boxTopo.bbox.max[2] - boxTopo.bbox.min[2]).toBeCloseTo(10, 3);
  const top = boxTopo.faces.find((face) => face.planar && face.normal?.[2] === 1)!;
  expect(top.area).toBeCloseTo(1600, 2);

  const onFace = await cad.control<Record<string, any>>("sketch.start", { bodyId: box.feature.bodyId, faceId: top.id });
  expect(onFace).toMatchObject({ active: true, loaded: true, refBodyId: box.feature.bodyId, refFaceId: top.id });
  expect(onFace.entities.filter((entity: { construction?: boolean }) => entity.construction).length).toBeGreaterThan(0);
  expect((await cad.control<{ mode: string }>("state")).mode).toBe("sketch");
  expect(await errorCode(cad, "extrude", { sketchId: base.sketchId, distance: 5 }), "в эскизе операции модели недоступны").toBe("wrong_mode");

  const projected = await cad.control<{ points: { x: number; y: number }[]; canvas: { left: number; width: number }; pixelsPerMm: number }>(
    "sketch.project",
    { points: [[0, 0], [10, 0]] },
  );
  expect(projected.points[1].x - projected.points[0].x).toBeCloseTo(10 * projected.pixelsPerMm, 3);
  expect(projected.points[0].x).toBeGreaterThan(projected.canvas.left);

  await cad.control("sketch.addEntities", { entities: [{ ...circle(0, 0, 6), id: "pocket" }] });
  const hasPocket = async () => (await cad.sketchEntities()).some((entity) => entity.id === "pocket");
  expect(await hasPocket()).toBe(true);

  expect(await cad.control("history.undo"), "в эскизе отмена правит эскиз, а не модель").toMatchObject({ scope: "sketch", canRedo: true });
  expect(await hasPocket()).toBe(false);
  expect(await channelKinds(cad)).toEqual(["sketch", "extrude"]);
  expect(await cad.control("history.redo")).toMatchObject({ scope: "sketch" });
  expect(await hasPocket()).toBe(true);

  const sketchShot = await cad.control<{ mime: string; dataBase64: string; width: number }>("sketch.capture");
  expect(sketchShot.mime).toBe("image/png");
  expect(sketchShot.dataBase64.startsWith("iVBORw0KGgo")).toBe(true);
  expect(sketchShot.width).toBeGreaterThan(300);
  expect(await errorCode(cad, "viewport.project", { points: [[0, 0, 0]] }), "3D-вьюпорт в эскизе скрыт").toBe("wrong_mode");
  expect(await errorCode(cad, "sketch.addEntities", { entities: [{ ...circle(1, 1, 2), id: "pocket" }] })).toBe("invalid_params");
  const pocketSketch = await cad.control<{ sketchId: string; mode: string }>("sketch.finish");
  expect(pocketSketch.mode).toBe("model");

  const pocket = await cad.control<Feature>("extrude", { sketchId: pocketSketch.sketchId, distance: 4, operation: "cut" });
  expect(pocket.feature.params).toMatchObject({ operation: "cut", engine: "browser_wasm" });
  expect(await sceneBodies(cad)).toEqual([pocket.feature.bodyId]);
  const pocketStats = await cad.control<{ openEdges: number; zLevels: number[] }>("mesh.stats", { bodyId: pocket.feature.bodyId });
  expect(pocketStats.openEdges).toBe(0);
  expect(pocketStats.zLevels).toContain(6);

  const pocketTopo = await cad.control<Topo>("topology", { bodyId: pocket.feature.bodyId });
  const topFront = pocketTopo.edges.find(
    (edge) => !edge.closed && near(edge.start[2], 10) && near(edge.end[2], 10) && near(edge.start[1], -20) && near(edge.end[1], -20),
  )!;
  const chamfer = await cad.control<Feature>("chamfer", { bodyId: pocket.feature.bodyId, edgeIds: [topFront.id], distance: 1.5 });
  expect(chamfer.feature.kind).toBe("chamfer");

  const chamferTopo = await cad.control<Topo>("topology", { bodyId: chamfer.feature.bodyId });
  expect(chamferTopo.faces.length).toBe(pocketTopo.faces.length + 1);
  const backCorners = chamferTopo.edges.filter((edge) => isVertical(edge) && near(edge.start[1], 20) && near(Math.abs(edge.start[0]), 20));
  expect(backCorners).toHaveLength(2);

  const before = await channelKinds(cad);
  const refused = await cad.request("fillet", { bodyId: chamfer.feature.bodyId, edgeIds: backCorners.map((edge) => edge.id), radius: 500 });
  expect(refused, "отказ ядра приходит ошибкой, а не зависшей панелью").toMatchObject({ ok: false, error: { code: "operation_failed" } });
  expect((refused as { error: { message: string } }).error.message.length).toBeGreaterThan(5);
  expect((await cad.control<{ mode: string; busy: boolean }>("state"))).toMatchObject({ mode: "model", busy: false });
  expect(await channelKinds(cad)).toEqual(before);
  expect(await errorCode(cad, "fillet", { bodyId: chamfer.feature.bodyId, edgeIds: ["no-such-edge"], radius: 1 })).toBe("not_found");

  const fillet = await cad.control<Feature>("fillet", {
    bodyId: chamfer.feature.bodyId,
    edgeIds: backCorners.map((edge) => edge.id),
    radius: 3,
  });
  expect(fillet.feature.kind).toBe("fillet");
  expect(await sceneBodies(cad)).toEqual([fillet.feature.bodyId]);
  const filletTopo = await cad.control<Topo>("topology", { bodyId: fillet.feature.bodyId });
  expect(filletTopo.faces.length).toBe(chamferTopo.faces.length + 2);
  expect((await cad.control<{ openEdges: number }>("mesh.stats", { bodyId: fillet.feature.bodyId })).openEdges).toBe(0);

  const kinds = ["sketch", "extrude", "sketch", "extrude", "chamfer", "fillet"];
  expect(await channelKinds(cad)).toEqual(kinds);
  expect((await cad.timeline()).map((entry) => entry.kind), "канал и сервер видят одну историю").toEqual(kinds);

  const step = await cad.control<ExportedFile>("export", { format: "step" });
  expect(step.mime).toBe("application/step");
  expect(step.filename).toMatch(/^e2e-control-model-\d+\.step$/);
  expect(Buffer.from(step.dataBase64, "base64").subarray(0, 13).toString()).toBe("ISO-10303-21;");

  const whole = await cad.control<ExportedFile>("export", { format: "stl" });
  expect(whole.mime).toBe("model/stl");
  expect(whole.filename).toMatch(/^e2e-control-model-\d+\.stl$/);
  const wholeStl = readStl(whole);
  expect(wholeStl.triangles).toBeGreaterThan(40);
  expect(wholeStl.size, "бинарный STL: заголовок и по 50 байт на треугольник").toBe(84 + wholeStl.triangles * 50);

  const finished = await cad.control<ExportedFile>("export", { format: "stl", bodyIds: [fillet.feature.bodyId] });
  expect(finished.filename, "файл одного тела назван по телу").toMatch(/^e2e-control-model-\d+-Тело \d+\.stl$/);
  expect(readStl(finished).triangles).toBe(wholeStl.triangles);

  const blank = await cad.control<ExportedFile>("export", { format: "stl", bodyIds: [box.feature.bodyId] });
  expect(blank.filename).not.toBe(finished.filename);
  expect(readStl(blank), "скрытая заготовка — куб из 12 треугольников").toEqual({ triangles: 12, size: 84 + 12 * 50 });

  expect(await errorCode(cad, "export", { format: "stl", bodyIds: ["no-such-body"] })).toBe("not_found");
  expect(await errorCode(cad, "export", { format: "obj" })).toBe("invalid_params");
  expect(await errorCode(cad, "export", { format: "stl", bodyIds: [] })).toBe("invalid_params");
  expect(await channelKinds(cad), "экспорт модель не меняет").toEqual(kinds);

  const undone = await cad.control<{ scope: string; canRedo: boolean }>("history.undo");
  expect(undone).toMatchObject({ scope: "model", canRedo: true });
  expect(await channelKinds(cad)).toEqual(kinds.slice(0, -1));
  expect(await sceneBodies(cad), "после отмены в сцене снова тело с фаской").toEqual([chamfer.feature.bodyId]);

  await cad.control("history.redo");
  expect(await channelKinds(cad)).toEqual(kinds);
  expect(await sceneBodies(cad)).toHaveLength(1);
  expect(await errorCode(cad, "history.redo")).toBe("operation_failed");

  await cad.control("sketch.start", { plane: "XZ" });
  await cad.control("sketch.addEntities", { entities: [circle(0, 0, 3)] });
  expect(await cad.control("sketch.cancel"), "отмена эскиза ничего не сохраняет").toEqual({ mode: "model" });
  expect(await channelKinds(cad)).toEqual(kinds);
  expect(await errorCode(cad, "sketch.start", { plane: "XY", bodyId: fillet.feature.bodyId, faceId: "1" })).toBe("invalid_params");
  expect(await errorCode(cad, "sketch.start", {})).toBe("invalid_params");

  expect(await cad.visibleBodyCount()).toBe(1);
  expect((await cad.topology()).openEdges).toBe(0);
  expect(pageErrors).toEqual([]);
});
