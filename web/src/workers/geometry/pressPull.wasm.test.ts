import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import { describeBodyTopology } from "@/lib/control/topology";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import { bodyMetrics, buildFixture, expectFixture, expectMetrics, type ShapeFixture } from "../testing/shapeFixture";
import { buildBody, circle, extrudeRequest, faceNames, rectangle, send, sendOk, type WorkerReply } from "../testing/workerHarness";
import { browserEntry, edgeBetween, line, loadQuietWorker, rebuiltBodies, revolveRequest } from "../testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const SIDE = 20;
const HEIGHT = 10;
const HOLE_RADIUS = 4;
const BOX = "pp-box";
const DRILLED = "pp-drilled";
const boxSketch = [rectangle("r", 0, 0, SIDE, SIDE)];

let box: WorkerReply;
let drilled: WorkerReply;
let top = "";
let side = "";
let front = "";
let bore = "";

function faceWhere(reply: WorkerReply, match: (face: ReturnType<typeof describeBodyTopology>["faces"][number]) => boolean): string {
  const faces = describeBodyTopology("", reply.mesh!).faces.filter(match);
  if (faces.length !== 1) throw new Error(`Подходящих граней: ${faces.length}.`);
  return faces[0].id;
}

function faceAt(reply: WorkerReply, centroid: Vector3): string {
  return faceWhere(reply, (face) => face.centroid !== null && Math.hypot(...centroid.map((value, axis) => value - face.centroid![axis])) < 1e-3);
}

function slab(height: number): ShapeFixture {
  return { volume: SIDE * SIDE * height, min: [0, 0, 0], max: [SIDE, SIDE, height], faces: 6, edges: 12 };
}

function drilledBox(radius: number): ShapeFixture {
  return { volume: SIDE * SIDE * HEIGHT - Math.PI * radius ** 2 * HEIGHT, min: [0, 0, 0], max: [SIDE, SIDE, HEIGHT], faces: 7, tolerance: 1e-5 };
}

let nextKey = 1;
function pressPull(bodyId: string, faces: string[], distance: number, newBody = false) {
  return { kind: "press_pull", bodyId, faceNames: faces, distance, newBody, featureKey: `k-pp-${nextKey++}` };
}

beforeAll(async () => {
  await loadQuietWorker();
  box = await buildBody(extrudeRequest(boxSketch, "k-pp-box", { distance: HEIGHT }), BOX);
  top = faceAt(box, [10, 10, HEIGHT]);
  side = faceAt(box, [SIDE, 10, HEIGHT / 2]);
  front = faceAt(box, [10, 0, HEIGHT / 2]);
  await buildBody(extrudeRequest([circle("c", 10, 10, HOLE_RADIUS)], "k-pp-pin", { distance: HEIGHT }), "pp-pin");
  drilled = await buildBody({ kind: "boolean", operation: "subtract", targetBodyId: BOX, toolBodyIds: ["pp-pin"], featureKey: "k-pp-drill" }, DRILLED);
  bore = faceWhere(drilled, (face) => !face.planar);
}, 60_000);

describe("сдвиг грани: эталоны (реальный OCCT/WASM)", () => {
  it("верхняя грань +5: брусок 20x20x15", async () => {
    await buildFixture(pressPull(BOX, [top], 5), "pp-up", slab(HEIGHT + 5));
  });

  it("верхняя грань -0.07: зазор под посадку, брусок 20x20x9.93", async () => {
    await buildFixture(pressPull(BOX, [top], -0.07), "pp-gap", slab(HEIGHT - 0.07));
  });

  it("боковая грань отверстия -1: радиус отверстия больше на 1", async () => {
    await buildFixture(pressPull(DRILLED, [bore], -1), "pp-bore-wide", drilledBox(HOLE_RADIUS + 1));
  });

  it("боковая грань отверстия +1: стенка наползает, радиус меньше на 1", async () => {
    await buildFixture(pressPull(DRILLED, [bore], 1), "pp-bore-narrow", drilledBox(HOLE_RADIUS - 1));
  });

  it("часть цилиндра (скругление угла) -0.5: вырезается четверть кольца", async () => {
    const corner = edgeBetween(box, [0, 0, 0], [0, 0, HEIGHT]);
    const rounded = await buildBody({ kind: "fillet", bodyId: BOX, featureKey: "k-pp-fillet", edgeNames: [corner], radius: 2 }, "pp-fillet");
    const roundedVolume = SIDE * SIDE * HEIGHT - (1 - Math.PI / 4) * 4 * HEIGHT;
    await buildFixture(pressPull("pp-fillet", [faceWhere(rounded, (face) => !face.planar)], -0.5), "pp-fillet-in", {
      volume: roundedVolume - (Math.PI / 4) * (2 ** 2 - 1.5 ** 2) * HEIGHT,
      min: [0, 0, 0],
      max: [SIDE, SIDE, HEIGHT],
      tolerance: 1e-5,
    });
  });

  it("несколько граней сразу: верх и бок наружу на 2", async () => {
    await buildFixture(pressPull(BOX, [top, side], 2), "pp-two", {
      volume: SIDE * SIDE * HEIGHT + SIDE * SIDE * 2 + SIDE * HEIGHT * 2,
      min: [0, 0, 0],
      max: [SIDE + 2, SIDE, HEIGHT + 2],
    });
  });

  it("несколько граней внутрь: верх и перед на 1", async () => {
    await buildFixture(pressPull(BOX, [top, front], -1), "pp-two-in", {
      volume: SIDE * (SIDE - 1) * (HEIGHT - 1),
      min: [0, 1, 0],
      max: [SIDE, SIDE, HEIGHT - 1],
      faces: 6,
    });
  });

  it("выдавить грань в новое тело: исходное не меняется", async () => {
    await buildFixture(pressPull(BOX, [top], 3, true), "pp-new", {
      volume: SIDE * SIDE * 3,
      min: [0, 0, HEIGHT],
      max: [SIDE, SIDE, HEIGHT + 3],
      faces: 6,
      edges: 12,
    });
    expectMetrics(bodyMetrics(BOX), slab(HEIGHT));
  });

  it("выдавить грань отверстия внутрь в новое тело: трубка в отверстии", async () => {
    await buildFixture(pressPull(DRILLED, [bore], 1, true), "pp-tube", {
      volume: Math.PI * (HOLE_RADIUS ** 2 - (HOLE_RADIUS - 1) ** 2) * HEIGHT,
      min: [10 - HOLE_RADIUS, 10 - HOLE_RADIUS, 0],
      max: [10 + HOLE_RADIUS, 10 + HOLE_RADIUS, HEIGHT],
      tolerance: 1e-5,
    });
  });
});

describe("сдвиг грани: стабильные имена", () => {
  it("сдвинутая грань и соседи сохраняют имена исходного тела", async () => {
    const moved = await buildBody(pressPull(BOX, [top], 5), "pp-names");

    expect(faceNames(moved).sort()).toEqual(faceNames(box).sort());
    expect(faceAt(moved, [10, 10, HEIGHT + 5])).toBe(top);
    expect(faceAt(moved, [SIDE, 10, (HEIGHT + 5) / 2])).toBe(side);
  });

  it("отверстие после сдвига сохраняет имя грани", async () => {
    const wide = await buildBody(pressPull(DRILLED, [bore], -1), "pp-bore-names");

    expect(faceWhere(wide, (face) => !face.planar)).toBe(bore);
    expect(faceNames(wide).sort()).toEqual(faceNames(drilled).sort());
  });

  it("одна и та же операция в новое тело даёт одни и те же имена", async () => {
    const request = { ...pressPull(BOX, [top], 3, true), featureKey: "k-pp-repeat" };
    const first = faceNames(await buildBody(request, "pp-repeat-1"));
    const second = faceNames(await buildBody(request, "pp-repeat-2"));

    expect(second).toEqual(first);
  });
});

describe("сдвиг грани: отказы с объяснением", () => {
  it("сдвиг внутрь глубже тела отклоняется", async () => {
    const reply = await send(pressPull(BOX, [top], -HEIGHT - 1));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/Уменьшите смещение/);
  });

  it("коническая грань не поддерживается и называется по типу", async () => {
    const triangle = [line("a", 0, 0, 5, 0), line("b", 5, 0, 0, 10), line("c", 0, 10, 0, 0)];
    const cone = await buildBody(revolveRequest(triangle, "k-pp-cone"), "pp-cone");
    const reply = await send(pressPull("pp-cone", [faceWhere(cone, (face) => !face.planar)], 1));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/плоскими и цилиндрическими.*коническая/);
  });

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["нулевое смещение", { distance: 0 }, /не может быть нулевым/],
    ["нечисловое смещение", { distance: Number.NaN }, /не может быть нулевым/],
    ["без граней", { faceNames: [] }, /хотя бы одну грань/],
    ["повтор грани", { faceNames: ["f-a", "f-a"] }, /не должны повторяться/],
    ["грань, которой нет в теле", { faceNames: ["f-missing"] }, /не существует/],
    ["тело, которого нет в ядре", { bodyId: "pp-missing" }, /не загружено/],
  ])("отклоняет: %s", async (_name, overrides, message) => {
    const reply = await send({ ...pressPull(BOX, [top], 2), ...overrides });

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(message);
  });
});

describe("пересборка цепочки выдавливание - сдвиг грани - скругление (реальный OCCT/WASM)", () => {
  const document: RebuildDocument = { components: {}, timeline: [] };

  async function rebuild(entryId: string, params: Record<string, unknown>) {
    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, entryId, params) });
    const entry = document.timeline.find((candidate) => candidate.id === entryId);
    if (entry) entry.params = { ...entry.params, ...params };
    const bodies = rebuiltBodies(reply);
    for (const body of bodies) await sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId: body.bodyId });
    return new Map(bodies.map((body) => [body.bodyId, body]));
  }

  beforeAll(async () => {
    const base = await buildBody(extrudeRequest(boxSketch, "k-rp-box", { distance: HEIGHT }), "rp-box");
    const lid = faceAt(base, [10, 10, HEIGHT]);
    const pressed = await buildBody({ kind: "press_pull", bodyId: "rp-box", faceNames: [lid], distance: 5, newBody: false, featureKey: "k-rp-pp" }, "rp-pressed");
    const edge = edgeBetween(pressed, [0, 0, 0], [0, 0, HEIGHT + 5]);
    await buildBody({ kind: "fillet", bodyId: "rp-pressed", featureKey: "k-rp-fillet", edgeNames: [edge], radius: 1 }, "rp-rounded");
    document.components = { "s-box": { type: "sketch", plane: "XY", plane_offset: 0, entities: boxSketch } };
    document.timeline = [
      browserEntry({ id: "e-box", kind: "extrude", sketch_id: "s-box", body_id: "rp-box", params: { distance: HEIGHT, feature_key: "k-rp-box" } }),
      browserEntry({ id: "pp-lid", kind: "press_pull", body_id: "rp-pressed", params: {
        target_body_id: "rp-box", face_ids: [lid], distance: 5, new_body: false, feature_key: "k-rp-pp",
      } }),
      browserEntry({ id: "f-corner", kind: "fillet", body_id: "rp-rounded", params: {
        target_body_id: "rp-pressed", edge_ids: [edge], radius: 1, feature_key: "k-rp-fillet",
      } }),
    ];
  });

  const roundedCorner = 1 - Math.PI / 4;

  it("новая высота выдавливания проходит через сдвиг и скругление по именам", async () => {
    const bodies = await rebuild("e-box", { distance: 20 });

    expect([...bodies.keys()]).toEqual(["rp-box", "rp-pressed", "rp-rounded"]);
    await expectFixture("rp-pressed", bodies.get("rp-pressed")!, slab(25));
    expectMetrics(bodyMetrics("rp-rounded"), { volume: SIDE * SIDE * 25 - roundedCorner * 25, min: [0, 0, 0], max: [SIDE, SIDE, 25], tolerance: 1e-5 });
  });

  it("новое смещение со знаком минус пересобирает сдвиг и скругление", async () => {
    const bodies = await rebuild("pp-lid", { distance: -0.07 });

    expect([...bodies.keys()]).toEqual(["rp-pressed", "rp-rounded"]);
    await expectFixture("rp-pressed", bodies.get("rp-pressed")!, slab(19.93));
    expectMetrics(bodyMetrics("rp-rounded"), { volume: SIDE * SIDE * 19.93 - roundedCorner * 19.93, min: [0, 0, 0], max: [SIDE, SIDE, 19.93], tolerance: 1e-5 });
  });

  it("сдвиг внутрь глубже тела отклоняет пересборку и оставляет тела прежними", async () => {
    const reply = await send({ kind: "rebuild", steps: browserRebuildPlan(document, "pp-lid", { distance: -40 }) });

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/Уменьшите смещение/);
    expectMetrics(bodyMetrics("rp-pressed"), slab(19.93));
  });
});
