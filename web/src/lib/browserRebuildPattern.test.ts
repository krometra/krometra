import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { bodyConsumers, deleteBody, type ModelDocument } from "./bodyHistory";
import { deleteTimelineEntry } from "./timelineEdits";
import { browserRebuildPlan, inputBodiesOf, isBodyStep, outputBodiesOf } from "./browserRebuildPlan";

const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({
  timestamp: "", label: patch.id, status: "ok", ...patch,
});

const browser = (params: Record<string, unknown>) => ({ ...params, engine: "browser_wasm" });
const body = (visible = true) => ({ type: "body", visible, source: { kind: "browser_extrude" } });

const pattern = (mode: "join" | "separate", extra: Record<string, unknown> = {}) => browser({
  target_body_id: "pin", pattern_type: "circular", mode, count: 3, angle: 360,
  axis: { kind: "face", body_id: "hub", name: "f-axis" }, feature_key: "kp", ...extra,
});

function document(mode: "join" | "separate"): ModelDocument {
  const outputs = mode === "join" ? { body_id: "ring" } : { body_id: "copy1", body_ids: ["copy1", "copy2"] };
  return {
    components: { pin: body(mode === "separate"), hub: body(), ring: body(), copy1: body(), copy2: body(), cut: body() },
    timeline: [
      entry({ id: "e-pin", kind: "extrude", body_id: "pin", params: browser({ distance: 5 }) }),
      entry({ id: "e-hub", kind: "import", body_id: "hub", params: browser({}) }),
      entry({ id: "pa", kind: "pattern", ...outputs, params: pattern(mode) }),
      entry({ id: "bo", kind: "boolean", result_body_id: "cut", target_body_id: "hub", tool_body_id: mode === "join" ? "ring" : "copy2", operation: "subtract", params: browser({}) }),
    ],
  };
}

describe("массив в пересборке истории", () => {
  it("входы массива — исходное тело и тело опорной оси", () => {
    const [, , patternEntry] = document("join").timeline;
    expect(inputBodiesOf(patternEntry)).toEqual(["pin", "hub"]);
    expect(outputBodiesOf(patternEntry)).toEqual(["ring"]);
  });

  it("объединённый массив пересобирается одним шагом с новым количеством", () => {
    const steps = browserRebuildPlan(document("join"), "pa", { count: 5 }).filter(isBodyStep);
    expect(steps.map((step) => step.entryId)).toEqual(["pa", "bo"]);
    expect(steps[0]).toMatchObject({
      outputBodyId: "ring",
      inputBodyIds: ["pin", "hub"],
      request: { kind: "pattern", bodyId: "pin", featureKey: "kp", mode: "join", instance: null, pattern: { type: "circular", count: 5, angle: 360 } },
    });
  });

  it("отдельные тела пересобираются шагом на каждый экземпляр", () => {
    const steps = browserRebuildPlan(document("separate"), "pa", { angle: 180 }).filter(isBodyStep);
    expect(steps.map((step) => [step.outputBodyId, step.request.instance])).toEqual([["copy1", 1], ["copy2", 2], ["cut", undefined]]);
    expect(steps[1].request).toMatchObject({ mode: "separate", pattern: { angle: 180 } });
  });

  it("правка опорного тела пересобирает массив", () => {
    const steps = browserRebuildPlan(document("join"), "e-hub", {}).filter(isBodyStep);
    expect(steps.map((step) => step.entryId)).toEqual(["e-hub", "pa", "bo"]);
  });
});

describe("массив в истории тел", () => {
  it("объединённый массив поглощает исходное тело, отдельные тела — нет", () => {
    expect(bodyConsumers(document("join")).get("pin")?.id).toBe("pa");
    expect(bodyConsumers(document("separate")).get("pin")).toBeUndefined();
  });

  it("удаление массива убирает все его тела", () => {
    const doc = document("separate");
    doc.timeline = doc.timeline.filter((item) => item.id !== "bo");
    const result = deleteTimelineEntry(doc, "pa").document;
    expect(result.components).not.toHaveProperty("copy1");
    expect(result.components).not.toHaveProperty("copy2");
    expect(result.components).toHaveProperty("pin");
  });

  it("второй экземпляр отдельного массива знает свою операцию", () => {
    const doc = document("separate");
    doc.timeline = doc.timeline.filter((item) => item.id !== "bo");
    const result = deleteBody(doc, "copy2", (item: TimelineEntry) => item.label);
    expect(result.timeline.map((item) => item.id)).toEqual(["e-pin", "e-hub"]);
  });

  it("удаление массива, на копию которого опирается вырез, отдаёт вырез на пересборку", () => {
    const result = deleteTimelineEntry(document("separate"), "pa");
    expect(result.document.timeline.map((item) => item.id)).toEqual(["e-pin", "e-hub", "bo"]);
    expect(result.seeds.bodies).toEqual(["copy1", "copy2"]);
  });
});
