import { beforeAll, describe, expect, it, vi } from "vitest";
import { generatedFaceName } from "@/lib/browserNaming";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import type { TimelineEntry } from "@/types/api";
import { buildBody, circle, edgeNames, extrudeRequest, faceNames, loadWorker, rectangle, sendOk, type WorkerReply } from "./testing/workerHarness";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

beforeAll(async () => {
  await loadWorker();
}, 60_000);

const box = [rectangle("r1", 0, 0, 20, 10)];
const browser = (params: Record<string, unknown>) => ({ ...params, engine: "browser_wasm" });
const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({
  timestamp: "", label: patch.id, status: "ok", ...patch,
});

function rebuiltBodies(reply: WorkerReply) {
  return reply.bodies as (WorkerReply & { bodyId: string })[];
}

describe("пересборка истории в browser worker (реальный OCCT/WASM)", () => {
  it("меняет высоту выдавливания и переносит скругление по стабильному имени ребра", async () => {
    const base = await buildBody(extrudeRequest(box, "k-rb-box"), "rb-box");
    const [edge] = edgeNames(base);
    const filleted = await buildBody({ kind: "fillet", bodyId: "rb-box", featureKey: "k-rb-f", edgeNames: [edge], radius: 1 }, "rb-fillet");
    const document: RebuildDocument = {
      components: { s1: { type: "sketch", plane: "XY", plane_offset: 0, entities: box } },
      timeline: [
        entry({ id: "e1", kind: "extrude", sketch_id: "s1", body_id: "rb-box", params: browser({ distance: 10, direction: "one_side", operation: "new_body", feature_key: "k-rb-box" }) }),
        entry({ id: "f1", kind: "fillet", body_id: "rb-fillet", params: browser({ target_body_id: "rb-box", edge_ids: [edge], radius: 1, feature_key: "k-rb-f" }) }),
      ],
    };

    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "e1", { distance: 30 }) });
    const [rebuiltBox, rebuiltFillet] = rebuiltBodies(reply);

    expect(rebuiltBox.bodyId).toBe("rb-box");
    expect(rebuiltBox.mesh?.bbox.max[2]).toBeCloseTo(30);
    expect(faceNames(rebuiltBox).sort()).toEqual(faceNames(base).sort());
    expect(rebuiltFillet.mesh?.bbox.max[2]).toBeCloseTo(30);
    expect(faceNames(rebuiltFillet).sort()).toEqual(faceNames(filleted).sort());
    expect(reply.cacheHits).toBe(0);

    const again = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "e1", { distance: 30 }) });
    expect(again.cacheHits).toBe(2);
    await Promise.all(rebuiltBodies(again).map((body) => sendOk({ kind: "discard", shapeHandle: body.shapeHandle })));

    await Promise.all(rebuiltBodies(reply).map((body) => sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId: body.bodyId })));
    const next = await sendOk({ kind: "fillet", bodyId: "rb-fillet", featureKey: "k-rb-f2", edgeNames: [edgeNames(rebuiltFillet)[0]], radius: 0.5 });
    expect(next.mesh?.bbox.max[2]).toBeCloseTo(30);
  });

  it("пересобирает выдавливание до грани по имени грани пересобранного тела", async () => {
    await buildBody(extrudeRequest(box, "k-uf-floor"), "uf-floor");
    const top = generatedFaceName("k-uf-floor", "end:r1.0");
    await buildBody(extrudeRequest([circle("c", 5, 5, 2)], "k-uf-post", {
      planeOffset: 40, distance: -1, extentType: "up_to_face", upToBodyId: "uf-floor", upToFaceId: top,
    }), "uf-post");
    const document: RebuildDocument = {
      components: {
        s1: { type: "sketch", plane: "XY", plane_offset: 0, entities: box },
        s2: { type: "sketch", plane: "XY", plane_offset: 40, entities: [circle("c", 5, 5, 2)] },
      },
      timeline: [
        entry({ id: "floor", kind: "extrude", sketch_id: "s1", body_id: "uf-floor", params: browser({ distance: 10, feature_key: "k-uf-floor" }) }),
        entry({ id: "post", kind: "extrude", sketch_id: "s2", body_id: "uf-post", params: browser({
          distance: -1, extent_type: "up_to_face", up_to_body_id: "uf-floor", up_to_face_id: top, feature_key: "k-uf-post",
        }) }),
      ],
    };

    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "floor", { distance: 25 }) });
    const post = rebuiltBodies(reply).find((body) => body.bodyId === "uf-post");

    expect(post?.mesh?.bbox.min[2]).toBeCloseTo(25);
    expect(post?.mesh?.bbox.max[2]).toBeCloseTo(40);
  });
});
