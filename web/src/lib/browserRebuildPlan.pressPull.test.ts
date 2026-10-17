import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { browserRebuildPlan, editableBrowserParams, type RebuildDocument, type RebuildStep } from "./browserRebuildPlan";
import { editableValues, featureParamFields, isValidParams } from "./browserFeatureParams";
import { consumedBodiesOf, fallbackBodyOf } from "./timelineFlags";

function entry(patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry {
  return { timestamp: "", label: patch.id, status: "ok", ...patch, params: { ...patch.params, engine: "browser_wasm" } };
}

function pressPullEntry(newBody: boolean): TimelineEntry {
  return entry({
    id: "pp-1", kind: "press_pull", body_id: "body-pressed",
    params: { target_body_id: "body-box", face_ids: ["f-top", "f-bore"], distance: -0.07, new_body: newBody, feature_key: "k-pp" },
  });
}

function documentWith(newBody: boolean): RebuildDocument {
  return {
    components: { "s-box": { plane: "XY", plane_offset: 0, entities: [] } },
    timeline: [
      entry({ id: "e-box", kind: "extrude", sketch_id: "s-box", body_id: "body-box", params: { distance: 10 } }),
      pressPullEntry(newBody),
    ],
  };
}

describe("пересборка сдвига грани", () => {
  it("из дерева правится только смещение со знаком", () => {
    expect(editableBrowserParams("press_pull")).toEqual(["distance"]);
    const pressed = pressPullEntry(false);
    expect(editableValues(pressed)).toEqual({ distance: -0.07 });
    expect(featureParamFields(pressed, editableValues(pressed))).toEqual([{ key: "distance", label: "Смещение", kind: "number", suffix: "мм" }]);
    expect(isValidParams({ distance: -0.07 })).toBe(true);
    expect(isValidParams({ distance: 0 })).toBe(false);
  });

  it("правка тела-источника пересобирает сдвиг по именам граней", () => {
    const steps = browserRebuildPlan(documentWith(false), "e-box", { distance: 20 }) as RebuildStep[];

    expect(steps.map((step) => step.entryId)).toEqual(["e-box", "pp-1"]);
    expect(steps[1]).toMatchObject({ kind: "press_pull", outputBodyId: "body-pressed", inputBodyIds: ["body-box"], fallbackBodyId: "body-box" });
    expect(steps[1].request).toEqual({
      kind: "press_pull", featureKey: "k-pp", bodyId: "body-box", faceNames: ["f-top", "f-bore"], distance: -0.07, newBody: false,
    });
  });

  it("новое смещение уходит в запрос пересборки", () => {
    const [step] = browserRebuildPlan(documentWith(true), "pp-1", { distance: 5 }) as RebuildStep[];

    expect(step.request).toMatchObject({ distance: 5, newBody: true });
    expect(step.fallbackBodyId).toBeNull();
  });

  it("сдвиг поглощает исходное тело, выдавливание в новое тело - нет", () => {
    expect(consumedBodiesOf(pressPullEntry(false))).toEqual(["body-box"]);
    expect(consumedBodiesOf(pressPullEntry(true))).toEqual([]);
    expect(fallbackBodyOf(pressPullEntry(true))).toBeNull();
  });
});
