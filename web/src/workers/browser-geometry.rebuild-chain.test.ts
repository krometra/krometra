import { beforeAll, describe, expect, it, vi } from "vitest";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import { bodyMetrics, expectFixture, expectMetrics, type ShapeFixture } from "./testing/shapeFixture";
import { buildBody, circle, extrudeRequest, rectangle, send, sendOk, type WorkerReply } from "./testing/workerHarness";
import { booleanRequest, browserEntry, edgeBetween, loadQuietWorker, rebuiltBodies, revolveRequest } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

beforeAll(async () => {
  await loadQuietWorker();
}, 60_000);

const FILLET_GAP = 1 - Math.PI / 4;
const HOLE_RADIUS = 2;

const plateSketch = [rectangle("r", 0, 0, 20, 10)];
const holeSketch = [circle("h", 5, 5, HOLE_RADIUS)];
const toolSketch = [rectangle("t", 15, 4, 25, 6)];
const ringSketch = [rectangle("rr", 5, 0, 10, 4)];

function plate(height: number): ShapeFixture {
  return { volume: 200 * height, area: 2 * 200 + 60 * height, min: [0, 0, 0], max: [20, 10, height], faces: 6, edges: 12 };
}

function holed(height: number): ShapeFixture {
  const hole = Math.PI * HOLE_RADIUS ** 2;
  return {
    ...plate(height),
    volume: (200 - hole) * height,
    area: 2 * (200 - hole) + 60 * height + 2 * Math.PI * HOLE_RADIUS * height,
    faces: 7,
    edges: 15,
  };
}

function rounded(height: number, radius: number): ShapeFixture {
  const base = holed(height);
  return {
    ...base,
    volume: base.volume - 4 * FILLET_GAP * radius ** 2 * height,
    area: (base.area ?? 0) - 4 * (2 * radius * height - (Math.PI / 2) * radius * height + 2 * FILLET_GAP * radius ** 2),
    faces: 11,
    edges: 27,
  };
}

function withTool(height: number, radius: number, toolHeight: number): ShapeFixture {
  const base = rounded(height, radius);
  return {
    ...base,
    volume: base.volume + 5 * 2 * toolHeight,
    area: (base.area ?? 0) + 2 * (5 * toolHeight) + 2 * (5 * 2),
    max: [25, 10, height],
    faces: 15,
    edges: 39,
  };
}

function chamferedRing(degrees: number, cut: number, min: ShapeFixture["min"], max: ShapeFixture["max"]): ShapeFixture {
  const [inner, outer, height] = [5, 10, 4];
  const share = degrees / 360;
  const fullVolume = Math.PI * (outer ** 2 - inner ** 2) * height - Math.PI * cut ** 2 * (outer - cut / 3);
  const fullArea = 2 * Math.PI * (outer ** 2 - inner ** 2) + 2 * Math.PI * (outer + inner) * height
    - 2 * Math.PI * outer * cut - Math.PI * (outer ** 2 - (outer - cut) ** 2) + Math.PI * (2 * outer - cut) * cut * Math.SQRT2;
  const caps = degrees === 360 ? 0 : 2 * ((outer - inner) * height - 0.5 * cut ** 2);
  return { volume: fullVolume * share, area: fullArea * share + caps, min, max, faces: degrees === 360 ? 5 : 7, edges: degrees === 360 ? 8 : 15 };
}

async function retainRebuilt(reply: WorkerReply) {
  const bodies = rebuiltBodies(reply);
  for (const body of bodies) await sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId: body.bodyId });
  return new Map(bodies.map((body) => [body.bodyId, body]));
}

async function rebuild(document: RebuildDocument, entryId: string, params: Record<string, unknown>) {
  const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, entryId, params) });
  const entry = document.timeline.find((candidate) => candidate.id === entryId);
  if (entry) entry.params = { ...entry.params, ...params };
  return retainRebuilt(reply);
}

describe("пересборка цепочки выдавливание - вырез - скругление - булева (реальный OCCT/WASM)", () => {
  const document: RebuildDocument = { components: {}, timeline: [] };

  beforeAll(async () => {
    await buildBody(extrudeRequest(plateSketch, "k-rc-plate"), "rc-plate");
    const cut = await buildBody(extrudeRequest(holeSketch, "k-rc-hole", {
      planeOffset: 5, distance: 1, direction: "symmetric", extentType: "through_all", operation: "cut", targetBodyId: "rc-plate",
    }), "rc-holed");
    const vertical = [[0, 0], [20, 0], [20, 10], [0, 10]].map(([x, y]) => edgeBetween(cut, [x, y, 0], [x, y, 10]));
    await buildBody({ kind: "fillet", bodyId: "rc-holed", featureKey: "k-rc-fillet", edgeNames: vertical, radius: 3 }, "rc-rounded");
    await buildBody(extrudeRequest(toolSketch, "k-rc-tool", { distance: 5 }), "rc-tool");
    await buildBody(booleanRequest("union", "rc-rounded", "rc-tool", "k-rc-union"), "rc-union");
    document.components = {
      "s-plate": { type: "sketch", plane: "XY", plane_offset: 0, entities: plateSketch },
      "s-hole": { type: "sketch", plane: "XY", plane_offset: 5, entities: holeSketch },
      "s-tool": { type: "sketch", plane: "XY", plane_offset: 0, entities: toolSketch },
    };
    document.timeline = [
      browserEntry({ id: "e-plate", kind: "extrude", sketch_id: "s-plate", body_id: "rc-plate", params: { distance: 10, feature_key: "k-rc-plate" } }),
      browserEntry({ id: "e-hole", kind: "extrude", sketch_id: "s-hole", body_id: "rc-holed", params: {
        distance: 1, direction: "symmetric", extent_type: "through_all", operation: "cut", target_body_id: "rc-plate", feature_key: "k-rc-hole",
      } }),
      browserEntry({ id: "f-corners", kind: "fillet", body_id: "rc-rounded", params: { target_body_id: "rc-holed", edge_ids: vertical, radius: 3, feature_key: "k-rc-fillet" } }),
      browserEntry({ id: "e-tool", kind: "extrude", sketch_id: "s-tool", body_id: "rc-tool", params: { distance: 5, feature_key: "k-rc-tool" } }),
      browserEntry({
        id: "b-union", kind: "boolean", operation: "union", target_body_id: "rc-rounded", tool_body_id: "rc-tool", result_body_id: "rc-union",
        params: { feature_key: "k-rc-union" },
      }),
    ];
  });

  it("исходная цепочка совпадает с эталоном до пересборки", () => {
    expectMetrics(bodyMetrics("rc-plate"), plate(10));
    expectMetrics(bodyMetrics("rc-holed"), holed(10));
    expectMetrics(bodyMetrics("rc-rounded"), rounded(10, 3));
    expectMetrics(bodyMetrics("rc-union"), withTool(10, 3, 5));
  });

  it("новая высота выдавливания проходит через вырез, скругление и объединение", async () => {
    const bodies = await rebuild(document, "e-plate", { distance: 30 });

    expect([...bodies.keys()]).toEqual(["rc-plate", "rc-holed", "rc-rounded", "rc-union"]);
    await expectFixture("rc-plate", bodies.get("rc-plate")!, plate(30));
    await expectFixture("rc-holed", bodies.get("rc-holed")!, holed(30));
    await expectFixture("rc-rounded", bodies.get("rc-rounded")!, rounded(30, 3));
    await expectFixture("rc-union", bodies.get("rc-union")!, withTool(30, 3, 5));
    expectMetrics(bodyMetrics("rc-tool"), { volume: 100, area: 160, min: [15, 4, 0], max: [25, 6, 5], faces: 6, edges: 12 });
  });

  it("новый радиус скругления пересобирает только скругление и объединение", async () => {
    const bodies = await rebuild(document, "f-corners", { radius: 1 });

    expect([...bodies.keys()]).toEqual(["rc-rounded", "rc-union"]);
    await expectFixture("rc-rounded", bodies.get("rc-rounded")!, rounded(30, 1));
    await expectFixture("rc-union", bodies.get("rc-union")!, withTool(30, 1, 5));
    expectMetrics(bodyMetrics("rc-holed"), holed(30));
  });

  it("новая высота инструмента пересобирает инструмент и объединение, не трогая основу", async () => {
    const bodies = await rebuild(document, "e-tool", { distance: 8 });

    expect([...bodies.keys()]).toEqual(["rc-tool", "rc-union"]);
    await expectFixture("rc-tool", bodies.get("rc-tool")!, { volume: 160, area: 2 * 20 + 24 * 8, min: [15, 4, 0], max: [25, 6, 8], faces: 6, edges: 12 });
    await expectFixture("rc-union", bodies.get("rc-union")!, withTool(30, 1, 8));
  });

  it("недопустимый радиус отклоняет пересборку целиком и оставляет тела в ядре прежними", async () => {
    const reply = await send({ kind: "rebuild", steps: browserRebuildPlan(document, "f-corners", { radius: 30 }) });

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/не строится/);
    expect(reply.bodies).toBeUndefined();
    expectMetrics(bodyMetrics("rc-rounded"), rounded(30, 1));
  });

  it("операция не из истории отклоняется на этапе плана", () => {
    expect(() => browserRebuildPlan(document, "e-unknown", {})).toThrow(/не найдена/);
  });
});

describe("пересборка цепочки вращение - фаска (реальный OCCT/WASM)", () => {
  const document: RebuildDocument = { components: {}, timeline: [] };
  const COS45 = Math.SQRT1_2;

  beforeAll(async () => {
    const ring = await buildBody(revolveRequest(ringSketch, "k-rc-ring"), "rc-ring");
    const rim = edgeBetween(ring, [10, 4, 0], [10, 4, 0]);
    await buildBody({ kind: "chamfer", bodyId: "rc-ring", featureKey: "k-rc-rim", edgeNames: [rim], distance1: 1, distance2: 1 }, "rc-chamfered");
    document.components = { "s-ring": { type: "sketch", plane: "XY", plane_offset: 0, entities: ringSketch } };
    document.timeline = [
      browserEntry({ id: "r-ring", kind: "revolve", sketch_id: "s-ring", body_id: "rc-ring", params: {
        axis_origin: { x: 0, y: 0 }, axis: "y", angle: 360, direction: "one_side", feature_key: "k-rc-ring",
      } }),
      browserEntry({ id: "c-rim", kind: "chamfer", body_id: "rc-chamfered", params: {
        target_body_id: "rc-ring", edge_ids: [rim], distance1: 1, distance2: 1, feature_key: "k-rc-rim",
      } }),
    ];
  });

  it("исходное кольцо с фаской совпадает с эталоном до пересборки", () => {
    expectMetrics(bodyMetrics("rc-chamfered"), chamferedRing(360, 1, [-10, 0, -10], [10, 4, 10]));
  });

  it("новый угол и симметричное направление переносят фаску на дугу сектора по имени ребра", async () => {
    const bodies = await rebuild(document, "r-ring", { angle: 90, direction: "symmetric" });

    expect([...bodies.keys()]).toEqual(["rc-ring", "rc-chamfered"]);
    await expectFixture("rc-chamfered", bodies.get("rc-chamfered")!, chamferedRing(90, 1, [5 * COS45, 0, -10 * COS45], [10, 4, 10 * COS45]));
  });

  it("новый катет фаски пересобирает только фаску", async () => {
    const bodies = await rebuild(document, "c-rim", { distance1: 0.5, distance2: 0.5 });

    expect([...bodies.keys()]).toEqual(["rc-chamfered"]);
    await expectFixture("rc-chamfered", bodies.get("rc-chamfered")!, chamferedRing(90, 0.5, [5 * COS45, 0, -10 * COS45], [10, 4, 10 * COS45]));
  });
});
