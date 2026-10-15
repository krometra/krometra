import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { browserRebuildPlan, editableBrowserParams, sketchRebuildRoots, type RebuildDocument, type RebuildStep } from "./browserRebuildPlan";
import { holeParamsOf } from "./holeFeature";
import { DEFAULT_HOLE_SPEC } from "./holeGeometry";

const circles = [{ id: "c", type: "circle", center: { x: 5, y: 5 }, radius: 1 }];

function entry(patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry {
  return { timestamp: "", label: patch.id, status: "ok", ...patch, params: { ...patch.params, engine: "browser_wasm" } };
}

function documentWith(hole: Partial<TimelineEntry>): RebuildDocument {
  return {
    components: {
      "s-plate": { plane: "XY", plane_offset: 0, entities: [] },
      "s-holes": { plane: "XY", plane_offset: 20, plane_basis: null, entities: circles },
    },
    timeline: [
      entry({ id: "e-plate", kind: "extrude", sketch_id: "s-plate", body_id: "body-plate", params: { distance: 20 } }),
      entry({
        id: "h-1", kind: "hole", body_id: "body-holed", ...hole,
        params: { target_body_id: "body-plate", face_id: "f-top", centers: [[1, 2, 20]], feature_key: "k-hole", ...holeParamsOf(DEFAULT_HOLE_SPEC) },
      }),
    ],
  };
}

describe("пересборка отверстия", () => {
  it("правят из дерева все размеры и варианты отверстия", () => {
    expect(editableBrowserParams("hole")).toEqual([
      "hole_type", "diameter", "extent", "depth", "bottom", "cbore_diameter", "cbore_depth", "csink_diameter", "csink_angle",
    ]);
  });

  it("отверстие по кликам пересобирается от тела-цели по сохранённым центрам", () => {
    const steps = browserRebuildPlan(documentWith({}), "e-plate", { distance: 30 }) as RebuildStep[];

    expect(steps.map((step) => step.entryId)).toEqual(["e-plate", "h-1"]);
    expect(steps[1]).toMatchObject({ kind: "hole", outputBodyId: "body-holed", inputBodyIds: ["body-plate"] });
    expect(steps[1].request).toMatchObject({
      kind: "hole", featureKey: "k-hole", bodyId: "body-plate", faceId: "f-top", centers: [[1, 2, 20]], entities: null, spec: DEFAULT_HOLE_SPEC,
    });
  });

  it("отверстие по эскизу берёт окружности эскиза и пересобирается при его правке", () => {
    const document = documentWith({ sketch_id: "s-holes" });
    const [step] = browserRebuildPlan(document, "h-1", { diameter: 7 }) as RebuildStep[];

    expect(step.request).toMatchObject({ entities: circles, plane: "XY", planeOffset: 20, spec: { ...DEFAULT_HOLE_SPEC, diameter: 7 } });
    expect(sketchRebuildRoots(document, "s-holes")).toEqual(["h-1"]);
  });
});
