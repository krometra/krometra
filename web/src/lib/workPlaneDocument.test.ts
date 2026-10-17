import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import type { ModelDocument } from "./bodyHistory";
import type { SketchSeatPlacement } from "./browserSketchSeat";
import { placementOfFrame, type WorkPlaneDefinition } from "./workPlane";
import {
  addWorkPlane,
  editedPlacement,
  editWorkPlane,
  isWorkPlane,
  newWorkPlaneId,
  nextWorkPlaneLabel,
  planeDependents,
  removeWorkPlane,
  setWorkPlaneVisible,
  sketchesOnPlane,
  workPlaneComponent,
  workPlaneEntries,
  workPlaneOwner,
} from "./workPlaneDocument";

const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({
  timestamp: "", label: patch.id, status: "ok", ...patch,
});
const offsetXY = (distance: number): WorkPlaneDefinition => ({ kind: "offset", reference: { kind: "base", plane: "XY" }, distance });
const at = (height: number): SketchSeatPlacement => placementOfFrame({ origin: [0, 0, height], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] });

function document(): ModelDocument {
  const plane = workPlaneComponent("Плоскость 1", offsetXY(10), at(10), {});
  return {
    components: {
      p1: plane,
      s1: { plane: "XY", plane_offset: 10, plane_basis: at(10).planeBasis, ref_plane_id: "p1", entities: [] },
      s2: { plane: "XY", plane_offset: 0, entities: [] },
      sf: { plane: "XY", plane_offset: 5, entities: [], ref_body_id: "b1", ref_face_id: "f-top" },
      b1: { type: "body" },
    },
    timeline: [
      entry({ id: "sk1", kind: "sketch", sketch_id: "s1", plane: "XY" }),
      entry({ id: "e1", kind: "extrude", sketch_id: "s1", body_id: "b2" }),
      entry({ id: "e2", kind: "extrude", sketch_id: "s2", body_id: "b3" }),
    ],
  };
}

describe("рабочая плоскость в документе", () => {
  it("распознаётся по типу и перечисляется с id", () => {
    const doc = document();
    expect(isWorkPlane(doc.components.p1)).toBe(true);
    expect(isWorkPlane(doc.components.s1)).toBe(false);
    expect(workPlaneEntries(doc.components).map((plane) => [plane.id, plane.label])).toEqual([["p1", "Плоскость 1"]]);
  });

  it("нумерует новые плоскости после существующих и выдаёт допустимый id", () => {
    expect(nextWorkPlaneLabel(document().components)).toBe("Плоскость 2");
    expect(nextWorkPlaneLabel({})).toBe("Плоскость 1");
    expect(newWorkPlaneId(0, 0)).toMatch(/^plane-[0-9a-z]+$/);
  });

  it("владелец — тело опор, в том числе через эскиз на грани; два тела — отказ", () => {
    const components = document().components;
    expect(workPlaneOwner(offsetXY(1), components)).toBeNull();
    expect(workPlaneOwner({ kind: "offset", reference: { kind: "face", bodyId: "b1", faceName: "f-1" }, distance: 1 }, components)).toBe("b1");
    expect(workPlaneOwner({ kind: "offset", reference: { kind: "sketch", sketchId: "sf" }, distance: 1 }, components)).toBe("b1");
    expect(() => workPlaneOwner({ kind: "midplane", faces: [{ bodyId: "b1", faceName: "f-1" }, { bodyId: "b9", faceName: "f-2" }] }, components))
      .toThrow(/одному телу/);
  });

  it("добавляется, не перезаписывая чужой компонент", () => {
    const doc = document();
    const added = addWorkPlane(doc, "p2", workPlaneComponent("Плоскость 2", offsetXY(3), at(3), doc.components));
    expect(workPlaneEntries(added.components)).toHaveLength(2);
    expect(() => addWorkPlane(doc, "s1", workPlaneComponent("x", offsetXY(3), at(3), {}))).toThrow();
  });

  it("правка переносит эскизы на плоскости и пересобирает их операции", () => {
    const doc = document();
    const result = editWorkPlane(doc, "p1", offsetXY(25), at(25));
    expect(result.document.components.p1).toMatchObject({ plane_offset: 25, definition: offsetXY(25) });
    expect(result.document.components.s1).toMatchObject({ plane_offset: 25, plane_basis: at(25).planeBasis, ref_plane_id: "p1" });
    expect(result.document.components.s2).toBe(doc.components.s2);
    expect(result.seeds).toEqual({ roots: ["e1"], bodies: [] });
    expect(result.restoreSeeds).toEqual(result.seeds);
    expect(planeDependents(doc, "p1").map((item) => item.id)).toEqual(["e1"]);
  });

  it("с эскизами на плоскости сохраняет начало координат в её плоскости", () => {
    const doc = document();
    const moved = editedPlacement(doc, "p1", { origin: [40, 40, 30], u: [0, 1, 0], v: [-1, 0, 0], n: [0, 0, 1] });
    expect(moved.planeBasis?.origin).toEqual([0, 0, 30]);
    expect(moved.planeBasis?.u).toEqual([1, 0, 0]);
    const lonely = removeWorkPlane(doc, "p1");
    const fresh = addWorkPlane(lonely, "p1", workPlaneComponent("Плоскость 1", offsetXY(1), at(1), {}));
    expect(editedPlacement(fresh, "p1", { origin: [40, 40, 30], u: [0, 1, 0], v: [-1, 0, 0], n: [0, 0, 1] }).planeBasis?.origin).toEqual([40, 40, 30]);
  });

  it("удаление отцепляет эскизы, оставляя их на месте", () => {
    const removed = removeWorkPlane(document(), "p1");
    expect(removed.components.p1).toBeUndefined();
    expect(removed.components.s1).toEqual({ plane: "XY", plane_offset: 10, plane_basis: at(10).planeBasis, entities: [] });
    expect(sketchesOnPlane(document().components, "p1")).toEqual(["s1"]);
    expect(() => removeWorkPlane(removed, "p1")).toThrow(/не найдена/);
  });

  it("видимость меняется только у плоскости", () => {
    expect(setWorkPlaneVisible(document(), "p1", false).components.p1).toMatchObject({ visible: false, label: "Плоскость 1" });
  });
});
