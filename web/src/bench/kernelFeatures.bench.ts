import { bench, describe } from "vitest";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import type { TimelineEntry } from "@/types/api";
import { extrudeRequest, type WorkerReply } from "@/workers/testing/workerHarness";
import {
  cornerEdges,
  PLATE_HEIGHT,
  REFERENCE_HOLES,
  REFERENCE_SIDE,
  retainBox,
  retainPlate,
  retainRod,
  retainSlab,
  retainTool,
  topRimEdges,
} from "./support/bodies";
import { discard, onFreshKernel, retain, roundTrip, send } from "./support/kernel";
import { holeGrid, slabOutline } from "./support/sketches";
import { HEAVY, KERNEL } from "./support/tiers";

const M10 = { pitch: 1.5, depth: null, length: 15, offset: 2, crestRatio: 0, starts: 1, rightHanded: true };
const HEIGHT_STEPS = 1000;
const HEIGHT_STEP = 0.005;

let edges: string[] = [];
let threadFace = "";
let chain: RebuildDocument = { components: {}, timeline: [] };
let rebuilds = 0;

async function retainBooleanPair() {
  await retainPlate("plate");
  await retainTool("tool");
}

function booleanRequest(operation: "union" | "subtract" | "intersect") {
  return { kind: "boolean", operation, targetBodyId: "plate", toolBodyIds: ["tool"], featureKey: `k-${operation}` };
}

const browser = (params: Record<string, unknown>) => ({ ...params, engine: "browser_wasm" });

const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({
  timestamp: "", label: patch.id, status: "ok", ...patch,
});

async function retainChain(): Promise<RebuildDocument> {
  const cut = { planeOffset: PLATE_HEIGHT, distance: -1, extentType: "through_all", operation: "cut", targetBodyId: "chain-slab" };
  await retainSlab("chain-slab", REFERENCE_SIDE);
  const holed = await retain(extrudeRequest(holeGrid(REFERENCE_HOLES), "k-chain-holes", cut), "chain-holed");
  const corners = cornerEdges(holed, REFERENCE_SIDE);
  const filleted = await retain({ kind: "fillet", bodyId: "chain-holed", featureKey: "k-chain-fillet", edgeNames: corners, radius: 2 }, "chain-filleted");
  return {
    components: {
      slab: { type: "sketch", plane: "XY", plane_offset: 0, entities: slabOutline(REFERENCE_SIDE) },
      holes: { type: "sketch", plane: "XY", plane_offset: PLATE_HEIGHT, entities: holeGrid(REFERENCE_HOLES) },
    },
    timeline: [
      entry({ id: "slab", kind: "extrude", sketch_id: "slab", body_id: "chain-slab", params: browser({
        distance: PLATE_HEIGHT, operation: "new_body", feature_key: "k-chain-slab",
      }) }),
      entry({ id: "holes", kind: "extrude", sketch_id: "holes", body_id: "chain-holed", params: browser({
        distance: -1, extent_type: "through_all", operation: "cut", target_body_id: "chain-slab", feature_key: "k-chain-holes",
      }) }),
      entry({ id: "fillet", kind: "fillet", body_id: "chain-filleted", params: browser({
        target_body_id: "chain-holed", edge_ids: corners, radius: 2, feature_key: "k-chain-fillet",
      }) }),
      entry({ id: "chamfer", kind: "chamfer", body_id: "chain-chamfered", params: browser({
        target_body_id: "chain-filleted", edge_ids: topRimEdges(filleted, PLATE_HEIGHT), distance1: 0.5, distance2: 0.5, feature_key: "k-chain-chamfer",
      }) }),
    ],
  };
}

async function rebuildChain(distance: number) {
  const reply = await send({ kind: "rebuild", steps: browserRebuildPlan(chain, "slab", { distance }) });
  for (const body of reply.bodies as WorkerReply[]) await discard(body);
}

describe("ядро: булевы операции тело-тело (плита с 16 отверстиями и брусок)", () => {
  for (const operation of ["union", "subtract", "intersect"] as const) {
    bench(operation, async () => roundTrip(booleanRequest(operation)), onFreshKernel(KERNEL, retainBooleanPair));
  }
});

describe("ядро: скругление и фаска", () => {
  bench(
    "скругление R2: 4 вертикальных ребра плиты с 16 отверстиями",
    async () => roundTrip({ kind: "fillet", bodyId: "plate", featureKey: "k-fillet", edgeNames: edges, radius: 2 }),
    onFreshKernel(KERNEL, async () => {
      edges = (await retainPlate("plate")).corners;
    }),
  );
  bench(
    "скругление R1: все 12 рёбер бруска",
    async () => roundTrip({ kind: "fillet", bodyId: "box", featureKey: "k-fillet", edgeNames: edges, radius: 1 }),
    onFreshKernel(KERNEL, async () => {
      edges = (await retainBox("box")).edges;
    }),
  );
  bench(
    "фаска 0.5: кромки 16 отверстий плиты",
    async () => roundTrip({ kind: "chamfer", bodyId: "plate", featureKey: "k-chamfer", edgeNames: edges, distance1: 0.5, distance2: 0.5 }),
    onFreshKernel(KERNEL, async () => {
      edges = (await retainPlate("plate")).rims;
    }),
  );
  bench(
    "фаска 1×2: все 12 рёбер бруска",
    async () => roundTrip({ kind: "chamfer", bodyId: "box", featureKey: "k-chamfer", edgeNames: edges, distance1: 1, distance2: 2 }),
    onFreshKernel(KERNEL, async () => {
      edges = (await retainBox("box")).edges;
    }),
  );
});

describe("ядро: резьба", () => {
  bench(
    "внешняя M10×1.5, длина 15 мм, один заход",
    async () => roundTrip({ kind: "thread", bodyId: "rod", faceId: threadFace, facePoints: [], options: M10, featureKey: "k-thread" }),
    onFreshKernel(HEAVY, async () => {
      threadFace = (await retainRod("rod")).threadFace;
    }),
  );
});

describe("ядро: пересборка истории (плита → 16 отверстий → скругление → фаска)", () => {
  const prepareChain = async () => {
    chain = await retainChain();
  };
  bench(
    "изменена высота плиты: все 4 операции строятся заново",
    async () => rebuildChain(PLATE_HEIGHT - (++rebuilds % HEIGHT_STEPS) * HEIGHT_STEP),
    onFreshKernel(KERNEL, prepareChain),
  );
  bench(
    "повтор без изменений: все 4 операции из кэша, только меш и STEP",
    async () => rebuildChain(PLATE_HEIGHT),
    onFreshKernel(KERNEL, prepareChain),
  );
});
