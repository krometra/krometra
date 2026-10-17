import { beforeAll, describe, expect, it, vi } from "vitest";
import type { BrowserTargetCut } from "@/composables/editor/useBrowserGeometry";
import type { SketchEntity } from "@/types/api";
import { NO_CUT_TARGET_MESSAGE } from "@/lib/browserBoolean";
import { browserRegenPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import { bodyMetrics, boxFixture, buildFixture, expectMetrics, expectNames, stepMetrics, type ShapeFixture } from "./testing/shapeFixture";
import { buildBody, circle, extrudeRequest, faceNames, rectangle, send, sendOk, type WorkerReply } from "./testing/workerHarness";
import { browserEntry, loadQuietWorker, rebuiltBodies } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const ROD_RADIUS = 2;
const ROD_AREA = Math.PI * ROD_RADIUS ** 2;
const ROD_VOLUME = ROD_AREA * 10;
const ROD_WALL = 2 * Math.PI * ROD_RADIUS * 10;
const CUBE = boxFixture([0, 0, 0], [20, 10, 10]);
const POCKET = 5 * 6 * 4;
const names: Record<string, string[]> = {};

async function source(bodyId: string, request: Record<string, unknown>) {
  names[bodyId] = faceNames(await buildBody(request, bodyId));
}

beforeAll(async () => {
  await loadQuietWorker();
  await source("cm-cube", extrudeRequest([rectangle("r-cube", 0, 0, 20, 10)], "k-cm-cube"));
  await source("cm-rod-a", extrudeRequest([circle("c-a", 5, 5, ROD_RADIUS)], "k-cm-rod-a"));
  await source("cm-rod-b", extrudeRequest([circle("c-b", 15, 5, ROD_RADIUS)], "k-cm-rod-b"));
  await source("cm-tall-a", extrudeRequest([circle("t-a", 5, 5, ROD_RADIUS)], "k-cm-tall-a", { distance: 15 }));
  await source("cm-tall-b", extrudeRequest([circle("t-b", 15, 5, ROD_RADIUS)], "k-cm-tall-b", { distance: 15 }));
  await source("cm-slab-x", extrudeRequest([rectangle("r-x", 5, 0, 25, 10)], "k-cm-slab-x"));
  await source("cm-slab-y", extrudeRequest([rectangle("r-y", 0, 0, 20, 5)], "k-cm-slab-y"));
  await source("cm-bar-a", extrudeRequest([rectangle("r-bar-a", 0, 0, 10, 10)], "k-cm-bar-a"));
  await source("cm-bar-b", extrudeRequest([rectangle("r-bar-b", 10, 0, 20, 10)], "k-cm-bar-b"));
  await source("cm-deep", extrudeRequest([rectangle("r-deep", 10, 0, 20, 10)], "k-cm-deep", { planeOffset: -10, distance: 20 }));
  await source("cm-far", extrudeRequest([rectangle("r-far", 100, 0, 110, 10)], "k-cm-far"));
}, 60_000);

let nextBody = 1;
async function combine(operation: "union" | "subtract" | "intersect", tools: string[], expected: ShapeFixture) {
  const key = `cm-result-${nextBody++}`;
  return buildFixture({ kind: "boolean", operation, targetBodyId: "cm-cube", toolBodyIds: tools, featureKey: `k-${key}` }, key, expected);
}

function inheritedOnly(reply: WorkerReply, sources: string[]) {
  const inherited = new Set(sources.flatMap((bodyId) => names[bodyId]));
  expect(faceNames(reply).filter((name) => !inherited.has(name.split("~")[0]))).toEqual([]);
}

describe("Combine с несколькими телами-инструментами (реальный OCCT/WASM)", () => {
  it("куб минус два цилиндра одной операцией теряет объём обоих цилиндров", async () => {
    const reply = await combine("subtract", ["cm-rod-a", "cm-rod-b"], {
      volume: 2000 - 2 * ROD_VOLUME,
      area: 1000 - 4 * ROD_AREA + 2 * ROD_WALL,
      min: [0, 0, 0],
      max: [20, 10, 10],
      faces: 8,
    });
    inheritedOnly(reply, ["cm-cube", "cm-rod-a", "cm-rod-b"]);
  });

  it("объединение с двумя торчащими цилиндрами добавляет их выступающие части", async () => {
    const reply = await combine("union", ["cm-tall-a", "cm-tall-b"], {
      volume: 2000 + 2 * ROD_AREA * 5,
      min: [0, 0, 0],
      max: [20, 10, 15],
    });
    inheritedOnly(reply, ["cm-cube", "cm-tall-a", "cm-tall-b"]);
  });

  it("пересечение оставляет объём, общий для цели и всех инструментов", async () => {
    await combine("intersect", ["cm-slab-x", "cm-slab-y"], boxFixture([5, 0, 0], [20, 5, 10]));
  });

  it("инструменты не меняются: «сохранить инструменты» оставляет их целыми телами", () => {
    const rod = { volume: ROD_VOLUME, min: [3, 3, 0], max: [7, 7, 10] } satisfies ShapeFixture;
    expectMetrics(bodyMetrics("cm-rod-a"), rod);
    expectMetrics(bodyMetrics("cm-rod-b"), { ...rod, min: [13, 3, 0], max: [17, 7, 10] });
    expectMetrics(bodyMetrics("cm-cube"), CUBE);
  });

  it("пустой список инструментов отклоняется", async () => {
    const reply = await send({ kind: "boolean", operation: "union", targetBodyId: "cm-cube", toolBodyIds: [], featureKey: "k-cm-empty" });
    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/инструмент/);
  });
});

function cutRequest(entities: SketchEntity[], featureKey: string, targetBodyIds: string[], overrides: Record<string, unknown> = {}) {
  return { ...extrudeRequest(entities, featureKey, { planeOffset: 10, distance: -4, operation: "cut", ...overrides }), kind: "extrude-cuts", targetBodyIds };
}

async function cutsOf(request: Record<string, unknown>): Promise<BrowserTargetCut[]> {
  return (await sendOk(request)).cuts as BrowserTargetCut[];
}

async function expectCut(cut: BrowserTargetCut, expected: ShapeFixture) {
  const metrics = await stepMetrics(cut.step);
  expectMetrics(metrics, expected);
  expectNames(cut as unknown as WorkerReply, metrics);
}

describe("вырез по нескольким телам (реальный OCCT/WASM)", () => {
  it("один вырез через два соседних бруска уменьшает каждый на объём своей части кармана, дальнее тело пропускается", async () => {
    const cuts = await cutsOf(cutRequest([rectangle("r-pocket", 5, 2, 15, 8)], "k-cm-pocket", ["cm-bar-a", "cm-bar-b", "cm-far"]));

    expect(cuts.map((cut) => cut.targetBodyId)).toEqual(["cm-bar-a", "cm-bar-b"]);
    await expectCut(cuts[0], { volume: 1000 - POCKET, min: [0, 0, 0], max: [10, 10, 10] });
    await expectCut(cuts[1], { volume: 1000 - POCKET, min: [10, 0, 0], max: [20, 10, 10] });
    expectMetrics(bodyMetrics("cm-bar-a"), boxFixture([0, 0, 0], [10, 10, 10]));
    await Promise.all(cuts.map((cut) => sendOk({ kind: "discard", shapeHandle: cut.shapeHandle })));
  });

  it("насквозь режет на глубину всех целей, а не только первой", async () => {
    const cuts = await cutsOf(cutRequest([circle("c-through", 10, 5, ROD_RADIUS)], "k-cm-through", ["cm-bar-a", "cm-deep"], {
      distance: -1, extentType: "through_all",
    }));

    expect(cuts.map((cut) => cut.targetBodyId)).toEqual(["cm-bar-a", "cm-deep"]);
    expect((await stepMetrics(cuts[0].step)).volume).toBeCloseTo(1000 - ROD_VOLUME / 2, 6);
    expect((await stepMetrics(cuts[1].step)).volume).toBeCloseTo(2000 - ROD_VOLUME, 6);
    await Promise.all(cuts.map((cut) => sendOk({ kind: "discard", shapeHandle: cut.shapeHandle })));
  });

  it("если вырез не задел ни одно тело, ядро отвечает ошибкой", async () => {
    const reply = await send(cutRequest([rectangle("r-miss", 5, 2, 15, 8)], "k-cm-miss", ["cm-far"]));
    expect(reply.ok).toBe(false);
    expect(reply.error).toBe(NO_CUT_TARGET_MESSAGE);
  });

  it("пересборка записи с несколькими целями строит каждое тело от своей цели", async () => {
    const pocket = [rectangle("r-pocket", 5, 2, 15, 8)];
    const document: RebuildDocument = {
      components: {
        "s-pocket": { type: "sketch", plane: "XY", plane_offset: 10, entities: pocket },
        "cm-bar-a": { type: "body" }, "cm-bar-b": { type: "body" }, "cm-out-a": { type: "body" }, "cm-out-b": { type: "body" },
      },
      timeline: [browserEntry({
        id: "e-pocket", kind: "extrude", sketch_id: "s-pocket", body_id: "cm-out-a", body_ids: ["cm-out-a", "cm-out-b"],
        params: { distance: -4, operation: "cut", target_body_id: "cm-bar-a", target_body_ids: ["cm-bar-a", "cm-bar-b"], feature_key: "k-cm-pocket" },
      })],
    };
    const deeper = { ...document, timeline: [{ ...document.timeline[0], params: { ...document.timeline[0].params, distance: -6 } }] };

    const reply = await sendOk({ kind: "rebuild", steps: browserRegenPlan(deeper, { roots: ["e-pocket"], bodies: [] }) });

    const bodies = rebuiltBodies(reply);
    expect(bodies.map((item) => item.bodyId)).toEqual(["cm-out-a", "cm-out-b"]);
    expectMetrics(await stepMetrics(bodies[0].step as ArrayBuffer), { volume: 1000 - 5 * 6 * 6, min: [0, 0, 0], max: [10, 10, 10] });
    expectMetrics(await stepMetrics(bodies[1].step as ArrayBuffer), { volume: 1000 - 5 * 6 * 6, min: [10, 0, 0], max: [20, 10, 10] });
  });
});
