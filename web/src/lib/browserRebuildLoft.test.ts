import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { editableBrowserParams, browserRebuildPlan, featureSketchIds, isBodyStep, sketchRebuildRoots, type RebuildDocument } from "./browserRebuildPlan";
import { sketchDependents } from "./timelineEdits";

const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({
  timestamp: "", label: patch.id, status: "ok", ...patch,
});

const square = (id: string, half: number) => ({ id, type: "rectangle", corner1: { x: -half, y: -half }, corner2: { x: half, y: half } });

function document(): RebuildDocument {
  return {
    components: {
      s1: { type: "sketch", plane: "XY", plane_offset: 0, entities: [square("a", 10)] },
      s2: { type: "sketch", plane: "XY", plane_offset: 15, entities: [square("b", 5)] },
      s3: { type: "sketch", plane: "XY", plane_offset: 30, entities: [square("c", 8)] },
      b0: { type: "body" },
    },
    timeline: [
      entry({ id: "k1", kind: "sketch", sketch_id: "s1" }),
      entry({ id: "k2", kind: "sketch", sketch_id: "s2" }),
      entry({ id: "k3", kind: "sketch", sketch_id: "s3" }),
      entry({ id: "lf", kind: "loft", sketch_id: "s1", body_id: "b1", params: {
        engine: "browser_wasm", profile_sketch_ids: ["s1", "s2", "s3"], transition: "smooth", operation: "cut", target_body_id: "b0", feature_key: "kl",
      } }),
      entry({ id: "fl", kind: "fillet", body_id: "b2", params: { engine: "browser_wasm", target_body_id: "b1", edge_ids: ["e"], radius: 1 } }),
    ],
  };
}

describe("пересборка лофта", () => {
  it("собирает все профили по порядку в запрос ядра", () => {
    const [loft] = browserRebuildPlan(document(), "lf", { transition: "ruled" }).filter(isBodyStep);
    expect(loft).toMatchObject({ kind: "loft", outputBodyId: "b1", inputBodyIds: ["b0"] });
    expect(loft.request).toMatchObject({ kind: "loft", featureKey: "kl", ruled: true, operation: "cut", targetBodyId: "b0" });
    expect((loft.request.sections as { planeOffset: number }[]).map((section) => section.planeOffset)).toEqual([0, 15, 30]);
  });

  it("пересобирается от правки любого профиля вместе с зависимыми операциями", () => {
    const doc = document();
    expect(featureSketchIds(doc.timeline[3])).toEqual(["s1", "s2", "s3"]);
    expect(sketchRebuildRoots(doc, "s3")).toEqual(["lf"]);
    expect(browserRebuildPlan(doc, "lf", {}).filter(isBodyStep).map((step) => step.entryId)).toEqual(["lf", "fl"]);
    expect(sketchDependents({ components: doc.components, timeline: doc.timeline }, "k2").map((dependent) => dependent.id)).toEqual(["lf"]);
  });

  it("правит только переход между профилями", () => {
    expect(editableBrowserParams("loft")).toEqual(["transition"]);
  });

  it("сообщает об удаленном эскизе профиля", () => {
    const doc = document();
    delete doc.components.s2;
    expect(() => browserRebuildPlan(doc, "lf", {})).toThrow("Эскиз операции «lf» не найден.");
  });
});
