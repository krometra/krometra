import { beforeAll, describe, expect, it, vi } from "vitest";
import { generatedFaceName } from "@/lib/browserNaming";
import { browserRegenPlan, type RebuildDocument, type RegenSeeds } from "@/lib/browserRebuildPlan";
import { deleteTimelineEntry, setEntrySuppressed } from "@/lib/timelineEdits";
import { bodyMetrics } from "./testing/shapeFixture";
import { buildBody, circle, extrudeRequest, faceNames, rectangle, sendOk, type WorkerReply } from "./testing/workerHarness";
import { browserEntry, loadQuietWorker, rebuiltBodies } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const BOX = "body-0000000000a1";
const BOSS = "body-0000000000a2";
const HOLED = "body-0000000000a3";
const PIN = "body-0000000000a4";
const boxSketch = [rectangle("r", 0, 0, 20, 10)];
const bossSketch = [rectangle("b", 5, 2, 9, 6)];
const holeSketch = [circle("h", 15, 5, 2)];
const pinSketch = [circle("p", 7, 4, 1)];
const topBasis = (height: number) => ({ origin: [0, 0, height], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] });
const BOX_VOLUME = 20 * 10 * 10;
const BOSS_VOLUME = 4 * 4 * 5;
const HOLE_VOLUME = Math.PI * 4 * 10;
const bossCap = generatedFaceName("k-tr-boss", "end:b.0");

let boss: WorkerReply;

beforeAll(async () => {
  await loadQuietWorker();
  await buildBody(extrudeRequest(boxSketch, "k-tr-box"), BOX);
  boss = await buildBody(extrudeRequest(bossSketch, "k-tr-boss", {
    planeOffset: 10, planeBasis: topBasis(10), distance: 5, operation: "join", targetBodyId: BOX,
  }), BOSS);
  await buildBody(extrudeRequest(holeSketch, "k-tr-hole", {
    planeOffset: 10, distance: -1, extentType: "through_all", operation: "cut", targetBodyId: BOSS,
  }), HOLED);
  await buildBody(extrudeRequest(pinSketch, "k-tr-pin", { planeOffset: 15, planeBasis: topBasis(15), distance: 3 }), PIN);
}, 60_000);

function document(): RebuildDocument {
  const body = (kind: string) => ({ type: "body", source: { kind } });
  return {
    components: {
      "s-box": { type: "sketch", plane: "XY", plane_offset: 0, entities: boxSketch },
      "s-boss": { type: "sketch", plane: "XY", plane_offset: 10, plane_basis: topBasis(10), entities: bossSketch },
      "s-hole": { type: "sketch", plane: "XY", plane_offset: 10, entities: holeSketch },
      "s-pin": { type: "sketch", plane: "XY", plane_offset: 15, plane_basis: topBasis(15), entities: pinSketch, ref_body_id: BOSS, ref_face_id: bossCap },
      [BOX]: body("browser_extrude"),
      [BOSS]: body("browser_extrude"),
      [HOLED]: body("browser_extrude"),
      [PIN]: body("browser_extrude"),
    },
    timeline: [
      browserEntry({ id: "e-box", kind: "extrude", sketch_id: "s-box", body_id: BOX, params: { distance: 10, operation: "new_body", feature_key: "k-tr-box" } }),
      browserEntry({ id: "e-boss", kind: "extrude", sketch_id: "s-boss", body_id: BOSS, params: {
        distance: 5, operation: "join", target_body_id: BOX, feature_key: "k-tr-boss",
      } }),
      browserEntry({ id: "e-hole", kind: "extrude", sketch_id: "s-hole", body_id: HOLED, params: {
        distance: -1, extent_type: "through_all", operation: "cut", target_body_id: BOSS, feature_key: "k-tr-hole",
      } }),
      browserEntry({ id: "sk-pin", kind: "sketch", sketch_id: "s-pin", label: "Эскиз штифта" }),
      browserEntry({ id: "e-pin", kind: "extrude", sketch_id: "s-pin", body_id: PIN, params: { distance: 3, operation: "new_body", feature_key: "k-tr-pin" } }),
    ],
  };
}

async function regenerate(edited: RebuildDocument, seeds: RegenSeeds) {
  const reply = await sendOk({ kind: "rebuild", steps: browserRegenPlan(edited, seeds) });
  const bodies = rebuiltBodies(reply);
  await Promise.all(bodies.map((body) => sendOk({ kind: "discard", shapeHandle: body.shapeHandle })));
  return { bodies, failures: reply.failures as { entryId: string; message: string }[] };
}

describe("правка истории с пересборкой зависимых (реальный OCCT/WASM)", () => {
  it("исходная цепочка: коробка с бобышкой и сквозным отверстием", () => {
    expect(faceNames(boss)).toContain(bossCap);
    expect(bodyMetrics(HOLED).volume).toBeCloseTo(BOX_VOLUME + BOSS_VOLUME - HOLE_VOLUME, 3);
  });

  it("подавленная бобышка выпадает из модели: отверстие режет коробку, эскиз на её торце помечен ошибкой", async () => {
    const edited = setEntrySuppressed(document(), "e-boss", true);

    const { bodies, failures } = await regenerate(edited.document, edited.seeds);

    expect(bodies.map((body) => body.bodyId)).toEqual([HOLED]);
    expect(bodies[0].mesh?.bbox.max[2]).toBeCloseTo(10, 6);
    expect(failures.map((failure) => failure.entryId)).toEqual(["sk-pin", "e-pin"]);
    expect(failures[0].message).toContain("«Эскиз штифта»: грань, на которой построен эскиз, исчезла");
  });

  it("снятие подавления возвращает бобышку и штифт на её торце", async () => {
    const suppressed = setEntrySuppressed(document(), "e-boss", true).document;
    const restored = setEntrySuppressed(suppressed, "e-boss", false);

    const { bodies, failures } = await regenerate(restored.document, restored.seeds);

    expect(failures).toEqual([]);
    expect(bodies.map((body) => body.bodyId)).toEqual([BOSS, HOLED, PIN]);
    expect(bodies.find((body) => body.bodyId === HOLED)?.mesh?.bbox.max[2]).toBeCloseTo(15, 6);
    expect(bodies.find((body) => body.bodyId === PIN)?.mesh?.bbox.min[2]).toBeCloseTo(15, 6);
  });

  it("удалённая бобышка: отверстие пересобирается от коробки, штифт без грани остаётся с ошибкой", async () => {
    const edited = deleteTimelineEntry(document(), "e-boss");

    const { bodies, failures } = await regenerate(edited.document, edited.seeds);

    expect(edited.document.timeline.find((entry) => entry.id === "e-hole")?.params?.target_body_id).toBe(BOX);
    expect(bodies.map((body) => body.bodyId)).toEqual([HOLED]);
    expect(bodies[0].mesh?.bbox.max[2]).toBeCloseTo(10, 6);
    expect(failures.map((failure) => failure.entryId)).toEqual(["sk-pin", "e-pin"]);
  });

  it("удалённое исходное тело оставляет все зависимые операции с ошибкой, ничего не строя", async () => {
    const edited = deleteTimelineEntry(document(), "e-box");

    const { bodies, failures } = await regenerate(edited.document, edited.seeds);

    expect(bodies).toEqual([]);
    expect(failures.map((failure) => failure.entryId)).toEqual(["e-boss", "sk-pin", "e-hole", "e-pin"]);
    expect(failures[0].message).toContain("удалено или не построилось");
  });
});
