import { beforeAll, describe, expect, it, vi } from "vitest";
import type { LinearPatternSpec } from "@/lib/bodyPattern";
import { patternTimelineParams } from "@/lib/bodyPatternParams";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import { buildBody, extrudeRequest, faceNames, rectangle, sendOk } from "./testing/workerHarness";
import { browserEntry, loadQuietWorker, rebuiltBodies } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

beforeAll(async () => {
  await loadQuietWorker();
}, 60_000);

const row: LinearPatternSpec = { type: "linear", axis: { kind: "x" }, count: 3, spacing: 20, axis2: null, count2: 1, spacing2: 10 };

describe("массив через сообщения worker (реальный OCCT/WASM)", () => {
  it("строит объединённый массив и пересобирает его по параметрам из истории", async () => {
    const base = await buildBody(extrudeRequest([rectangle("r-pm", 0, 0, 10, 4)], "k-pm-base", { distance: 2 }), "pm-base");
    const built = await sendOk({ kind: "pattern", bodyId: "pm-base", featureKey: "k-pm", pattern: row, mode: "join", instance: null });
    expect(built.mesh?.bbox.max[0]).toBeCloseTo(50);
    expect(faceNames(built)).toEqual(expect.arrayContaining(faceNames(base)));
    await sendOk({ kind: "retain", shapeHandle: built.shapeHandle, bodyId: "pm-row" });

    const document: RebuildDocument = {
      components: {},
      timeline: [
        browserEntry({ id: "base", kind: "import", body_id: "pm-base" }),
        browserEntry({ id: "pa", kind: "pattern", body_id: "pm-row", params: { target_body_id: "pm-base", feature_key: "k-pm", ...patternTimelineParams(row, "join") } }),
      ],
    };
    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "pa", { count: 5, spacing: -15 }) });
    const [rebuilt] = rebuiltBodies(reply);
    expect(rebuilt.bodyId).toBe("pm-row");
    expect(rebuilt.mesh?.bbox.min[0]).toBeCloseTo(-60);
    expect(rebuilt.mesh?.bbox.max[0]).toBeCloseTo(10);
  });

  it("отдельные тела пересобираются по экземпляру на тело", async () => {
    await buildBody(extrudeRequest([rectangle("r-ps", 0, 0, 10, 4)], "k-ps-base", { distance: 2 }), "ps-base");
    const document: RebuildDocument = {
      components: {},
      timeline: [
        browserEntry({ id: "base", kind: "import", body_id: "ps-base" }),
        browserEntry({ id: "pa", kind: "pattern", body_id: "ps-1", body_ids: ["ps-1", "ps-2"], params: { target_body_id: "ps-base", ...patternTimelineParams(row, "separate") } }),
      ],
    };
    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "pa", { spacing: 30 }) });
    expect(rebuiltBodies(reply).map((body) => [body.bodyId, body.mesh?.bbox.min[0]])).toEqual([["ps-1", 30], ["ps-2", 60]]);
  });
});
