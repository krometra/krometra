import { describe, expect, it } from "vitest";
import type { DimensionTarget } from "./dimensionPlan";
import { marksOfTargets } from "./selectionMarks";
import { SKETCH_AXIS_IDS, SKETCH_ORIGIN_ID, isFixedReference } from "./sketchOrigin";
import {
  selectedEntityIds,
  selectionKey,
  selectionOfAnchor,
  selectionRef,
  toggleSelectionItem,
  uniqueSelection,
  type SketchSelectionItem,
} from "./sketchSelection";

const entity: SketchSelectionItem = { kind: "entity", entityId: "l" };
const end: SketchSelectionItem = { kind: "point", entityId: "l", subIndex: 1 };
const axis: SketchSelectionItem = { kind: "axis", axis: "y" };
const origin: SketchSelectionItem = { kind: "origin" };

describe("модель выделения эскиза", () => {
  it("объект и его точка — разные элементы выделения", () => {
    expect(selectionKey(entity)).not.toBe(selectionKey(end));
    expect(toggleSelectionItem([entity], end)).toEqual([entity, end]);
  });

  it("повторный выбор снимает элемент, число элементов не ограничено", () => {
    const items = [entity, end, axis, origin].reduce<SketchSelectionItem[]>(toggleSelectionItem, []);
    expect(items).toHaveLength(4);
    expect(toggleSelectionItem(items, { kind: "axis", axis: "y" })).toEqual([entity, end, origin]);
  });

  it("каждый элемент превращается в якорь ограничения", () => {
    expect(selectionRef(entity)).toEqual({ entity_id: "l", sub_index: 0 });
    expect(selectionRef(end)).toEqual({ entity_id: "l", sub_index: 1 });
    expect(selectionRef(axis)).toEqual({ entity_id: SKETCH_AXIS_IDS.y, sub_index: 0 });
    expect(selectionRef(origin)).toEqual({ entity_id: SKETCH_ORIGIN_ID, sub_index: 0 });
  });

  it("якорь канала управления превращается в элемент выделения", () => {
    expect(selectionOfAnchor("l", undefined)).toEqual(entity);
    expect(selectionOfAnchor("l", 1)).toEqual(end);
    expect(selectionOfAnchor(SKETCH_AXIS_IDS.y, undefined)).toEqual(axis);
    expect(selectionOfAnchor(SKETCH_ORIGIN_ID, 0)).toEqual(origin);
  });

  it("uniqueSelection убирает повторы, selectedEntityIds — только объекты целиком", () => {
    expect(uniqueSelection([entity, end, { ...entity }])).toEqual([entity, end]);
    expect(selectedEntityIds([entity, end, axis])).toEqual(["l"]);
  });

  it("неподвижные опоры: начало координат, оси и рёбра грани", () => {
    expect([SKETCH_ORIGIN_ID, SKETCH_AXIS_IDS.x, "face-edge-4-12"].every(isFixedReference)).toBe(true);
    expect(isFixedReference("sketch-entity-1")).toBe(false);
  });
});

describe("marksOfTargets", () => {
  it("точки, выбранные оси и ось под курсором", () => {
    const point: DimensionTarget = { kind: "point", ref: { entity_id: "l", sub_index: 2 }, at: { x: 5, y: 0 } };
    const axisX: DimensionTarget = { kind: "line", ref: { entity_id: SKETCH_AXIS_IDS.x, sub_index: 0 }, segment: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, infinite: true };
    const axisY: DimensionTarget = { ...axisX, ref: { entity_id: SKETCH_AXIS_IDS.y, sub_index: 0 } };
    expect(marksOfTargets([point, axisX, null], axisY)).toEqual({ points: [{ x: 5, y: 0 }], axes: ["x"], hoveredAxis: "y" });
  });
});
