import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import { describeBodyTopology } from "@/lib/control/topology";
import { tangentFaceChain } from "@/lib/faceTangentChain";
import { bodyMetrics, expectFixture, expectMetrics } from "../testing/shapeFixture";
import { buildBody, circle, extrudeRequest, faceNames, rectangle, send, sendOk, type WorkerReply } from "../testing/workerHarness";
import { browserEntry, edgeBetween, loadQuietWorker, rebuiltBodies } from "../testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const SIDE = 20;
const HEIGHT = 10;
const BOX = "dr-box";
const ROD = "dr-rod";
const ROD_RADIUS = 5;
const TAN5 = Math.tan((5 * Math.PI) / 180);
const INSET = HEIGHT * TAN5;

let box: WorkerReply;
let bottom = "";
let top = "";
let sides: string[] = [];
let rodSide = "";
let rodBottom = "";

function faceAt(reply: WorkerReply, centroid: Vector3): string {
  const faces = describeBodyTopology("", reply.mesh!).faces.filter((face) => (
    face.centroid !== null && Math.hypot(...centroid.map((value, axis) => value - face.centroid![axis])) < 1e-3
  ));
  if (faces.length !== 1) throw new Error(`Граней с центром ${centroid}: ${faces.length}.`);
  return faces[0].id;
}

beforeAll(async () => {
  await loadQuietWorker();
  box = await buildBody(extrudeRequest([rectangle("r", 0, 0, SIDE, SIDE)], "k-dr-box", { distance: HEIGHT }), BOX);
  bottom = faceAt(box, [10, 10, 0]);
  top = faceAt(box, [10, 10, HEIGHT]);
  sides = [faceAt(box, [0, 10, 5]), faceAt(box, [SIDE, 10, 5]), faceAt(box, [10, 0, 5]), faceAt(box, [10, SIDE, 5])];
  const rod = await buildBody(extrudeRequest([circle("c", 0, 0, ROD_RADIUS)], "k-dr-rod", { distance: HEIGHT }), ROD);
  rodBottom = faceAt(rod, [0, 0, 0]);
  rodSide = describeBodyTopology("", rod.mesh!).faces.find((face) => !face.planar)!.id;
}, 60_000);

let nextKey = 1;
function draftRequest(bodyId: string, faces: string[], neutral: Record<string, unknown>, angleDeg: number, reverse = false) {
  return { kind: "draft", bodyId, faceNames: faces, neutral, angleDeg, reverse, featureKey: `k-dr-${nextKey++}` };
}

function frustumVolume(bottomSide: number, topSide: number, height: number): number {
  const a = bottomSide ** 2;
  const b = topSide ** 2;
  return (height / 3) * (a + b + Math.sqrt(a * b));
}

describe("уклон: эталоны (реальный OCCT/WASM)", () => {
  it("четыре боковые грани от нижней грани: усечённая пирамида, верх сужается на 10·tg5° с каждой стороны", async () => {
    const reply = await sendOk(draftRequest(BOX, sides, { kind: "face", faceId: bottom }, 5));
    await sendOk({ kind: "retain", shapeHandle: reply.shapeHandle, bodyId: "dr-pyramid" });
    await expectFixture("dr-pyramid", reply, {
      volume: frustumVolume(SIDE, SIDE - 2 * INSET, HEIGHT),
      min: [0, 0, 0],
      max: [SIDE, SIDE, HEIGHT],
      faces: 6,
      edges: 12,
    });
    const topology = describeBodyTopology("", reply.mesh!);
    const topFace = topology.faces.find((face) => face.id === top)!;
    expect(topFace.area).toBeCloseTo((SIDE - 2 * INSET) ** 2, 3);
  });

  it("одна грань: призма с трапецией в сечении", async () => {
    await expectFixture("dr-one", await buildBody(draftRequest(BOX, [sides[1]], { kind: "face", faceId: bottom }, 5), "dr-one"), {
      volume: SIDE * HEIGHT * (SIDE - INSET / 2),
      min: [0, 0, 0],
      max: [SIDE, SIDE, HEIGHT],
      faces: 6,
    });
  });

  it("базовая плоскость XY совпадает с нижней гранью: тот же результат", async () => {
    const reply = await buildBody(draftRequest(BOX, sides, { kind: "base", plane: "XY" }, 5), "dr-xy");
    expectMetrics(bodyMetrics("dr-xy"), { volume: frustumVolume(SIDE, SIDE - 2 * INSET, HEIGHT), min: [0, 0, 0], max: [SIDE, SIDE, HEIGHT] });
    expect(faceNames(reply).sort()).toEqual(faceNames(box).sort());
  });

  it("реверс: от нижней грани тело расширяется кверху", async () => {
    await buildBody(draftRequest(BOX, sides, { kind: "face", faceId: bottom }, 5, true), "dr-reverse");
    expectMetrics(bodyMetrics("dr-reverse"), {
      volume: frustumVolume(SIDE, SIDE + 2 * INSET, HEIGHT),
      min: [-INSET, -INSET, 0],
      max: [SIDE + INSET, SIDE + INSET, HEIGHT],
    });
  });

  it("нейтраль по верхней грани: сужается низ", async () => {
    await buildBody(draftRequest(BOX, sides, { kind: "face", faceId: top }, 5), "dr-top");
    expectMetrics(bodyMetrics("dr-top"), { volume: frustumVolume(SIDE, SIDE - 2 * INSET, HEIGHT), min: [0, 0, 0], max: [SIDE, SIDE, HEIGHT] });
  });

  it("цилиндр: боковая грань становится конусом", async () => {
    await buildBody(draftRequest(ROD, [rodSide], { kind: "face", faceId: rodBottom }, 5), "dr-cone");
    const topRadius = ROD_RADIUS - INSET;
    const volume = (Math.PI * HEIGHT / 3) * (ROD_RADIUS ** 2 + topRadius ** 2 + ROD_RADIUS * topRadius);
    expect(bodyMetrics("dr-cone").volume).toBeCloseTo(volume, 2);
  });
});

describe("уклон: касательная цепочка", () => {
  it("скруглённый корпус: цепочка от боковой грани берёт все стенки и скругления, уклон делает их конусами", async () => {
    const corners = [[0, 0], [SIDE, 0], [SIDE, SIDE], [0, SIDE]].map(([x, y]) => edgeBetween(box, [x, y, 0], [x, y, HEIGHT]));
    const rounded = await buildBody({ kind: "fillet", bodyId: BOX, featureKey: "k-dr-rounded", edgeNames: corners, radius: 3 }, "dr-rounded");
    const chain = tangentFaceChain(rounded.mesh!, faceAt(rounded, [0, 10, 5]));
    expect(chain).toHaveLength(8);
    await buildBody(draftRequest("dr-rounded", chain, { kind: "face", faceId: faceAt(rounded, [10, 10, 0]) }, 5), "dr-rounded-draft");
    const area = (z: number) => (SIDE - 2 * z * TAN5) ** 2 - (4 - Math.PI) * (3 - z * TAN5) ** 2;
    const simpson = (HEIGHT / 6) * (area(0) + 4 * area(HEIGHT / 2) + area(HEIGHT));
    expect(bodyMetrics("dr-rounded-draft").volume).toBeCloseTo(simpson, 2);
  });
});

describe("уклон: имена граней", () => {
  it("грани сохраняют имена исходного тела, скругление после уклона ссылается на них", async () => {
    const reply = await buildBody(draftRequest(BOX, sides, { kind: "face", faceId: bottom }, 5), "dr-named");
    expect(faceNames(reply).sort()).toEqual(faceNames(box).sort());
    const edge = edgeBetween(reply, [0, 0, 0], [SIDE, 0, 0]);
    const fillet = await send({ kind: "fillet", bodyId: "dr-named", featureKey: "k-dr-fillet", edgeNames: [edge], radius: 1 });
    expect(fillet.ok).toBe(true);
  });
});

describe("уклон: отказы", () => {
  it("угол 0 отклоняется понятной ошибкой", async () => {
    const reply = await send(draftRequest(BOX, sides, { kind: "face", faceId: bottom }, 0));
    expect(reply.ok).toBe(false);
    expect(reply.error).toContain("больше 0°");
  });

  it("грань, параллельная нейтрали, отклоняется с причиной", async () => {
    const reply = await send(draftRequest(BOX, [top], { kind: "face", faceId: bottom }, 5));
    expect(reply.ok).toBe(false);
    expect(reply.error).toContain("параллельна нейтральной плоскости");
  });

  it("нейтральная грань не может идти под уклон", async () => {
    const reply = await send(draftRequest(BOX, [bottom, sides[0]], { kind: "face", faceId: bottom }, 5));
    expect(reply.ok).toBe(false);
    expect(reply.error).toContain("Нейтральная грань");
  });

  it("криволинейная нейтраль отклоняется", async () => {
    const reply = await send(draftRequest(ROD, [rodBottom], { kind: "face", faceId: rodSide }, 5));
    expect(reply.ok).toBe(false);
    expect(reply.error).toContain("только плоская грань");
  });

  it("слишком большой угол: грани сходятся, ошибка называет помещающийся угол, тело не меняется", async () => {
    const before = bodyMetrics(BOX);
    const reply = await send(draftRequest(BOX, sides, { kind: "face", faceId: bottom }, 60));
    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/Уклон 60° не строится/);
    expect(reply.error).toMatch(/помещается примерно до \d+(\.\d)?°/);
    expectMetrics(bodyMetrics(BOX), { volume: before.volume, min: before.min, max: before.max });
  });
});

describe("уклон: пересборка", () => {
  const document: RebuildDocument = { components: {}, timeline: [] };
  const boxSketch = [rectangle("r", 0, 0, SIDE, SIDE)];

  async function rebuild(entryId: string, params: Record<string, unknown>) {
    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, entryId, params) });
    const entry = document.timeline.find((candidate) => candidate.id === entryId);
    if (entry) entry.params = { ...entry.params, ...params };
    const bodies = rebuiltBodies(reply);
    for (const body of bodies) await sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId: body.bodyId });
    return new Map(bodies.map((body) => [body.bodyId, body]));
  }

  function topArea(reply: WorkerReply, faceId: string): number {
    return describeBodyTopology("", reply.mesh!).faces.find((face) => face.id === faceId)!.area;
  }

  beforeAll(async () => {
    const base = await buildBody(extrudeRequest(boxSketch, "k-rb-box", { distance: HEIGHT }), "rb-box");
    const baseSides = [[0, 10, 5], [SIDE, 10, 5], [10, 0, 5], [10, SIDE, 5]].map((point) => faceAt(base, point as Vector3));
    const drafted = await buildBody({
      ...draftRequest("rb-box", baseSides, { kind: "base", plane: "XY" }, 5), featureKey: "k-rb-draft",
    }, "rb-draft");
    const edge = edgeBetween(drafted, [0, 0, 0], [SIDE, 0, 0]);
    await buildBody({ kind: "fillet", bodyId: "rb-draft", featureKey: "k-rb-fillet", edgeNames: [edge], radius: 1 }, "rb-rounded");
    document.components = { "s-box": { type: "sketch", plane: "XY", plane_offset: 0, entities: boxSketch } };
    document.timeline = [
      browserEntry({ id: "e-box", kind: "extrude", sketch_id: "s-box", body_id: "rb-box", params: { distance: HEIGHT, feature_key: "k-rb-box" } }),
      browserEntry({ id: "d-sides", kind: "draft", body_id: "rb-draft", params: {
        target_body_id: "rb-box", face_ids: baseSides, neutral_plane: "XY", angle_deg: 5, reverse: false, feature_key: "k-rb-draft",
      } }),
      browserEntry({ id: "f-edge", kind: "fillet", body_id: "rb-rounded", params: {
        target_body_id: "rb-draft", edge_ids: [edge], radius: 1, feature_key: "k-rb-fillet",
      } }),
    ];
  });

  it("новая высота тела-источника пересобирает уклон и скругление по именам", async () => {
    const bodies = await rebuild("e-box", { distance: 20 });
    expect([...bodies.keys()]).toEqual(["rb-box", "rb-draft", "rb-rounded"]);
    const inset = 20 * TAN5;
    expectMetrics(bodyMetrics("rb-draft"), { volume: frustumVolume(SIDE, SIDE - 2 * inset, 20), min: [0, 0, 0], max: [SIDE, SIDE, 20] });
    expect(bodyMetrics("rb-rounded").volume).toBeLessThan(bodyMetrics("rb-draft").volume);
  });

  it("правка угла пересобирает уклон и зависимое скругление, не трогая основу", async () => {
    const bodies = await rebuild("d-sides", { angle_deg: 3 });
    expect([...bodies.keys()]).toEqual(["rb-draft", "rb-rounded"]);
    const inset = 20 * Math.tan((3 * Math.PI) / 180);
    const top = faceAt(bodies.get("rb-draft")!, [10, 10, 20]);
    expect(topArea(bodies.get("rb-draft")!, top)).toBeCloseTo((SIDE - 2 * inset) ** 2, 3);
  });

  it("слишком большой угол отклоняет пересборку целиком и оставляет тела прежними", async () => {
    const before = bodyMetrics("rb-draft");
    const reply = await send({ kind: "rebuild", steps: browserRebuildPlan(document, "d-sides", { angle_deg: 45 }) });
    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/не строится/);
    expect(bodyMetrics("rb-draft").volume).toBeCloseTo(before.volume, 6);
  });
});
