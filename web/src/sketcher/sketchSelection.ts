import type { ConstraintRef } from "@/types/api";
import { SKETCH_AXIS_IDS, SKETCH_ORIGIN_ID, isSketchOrigin, sketchAxisOf, type SketchAxis } from "./sketchOrigin";

export type SketchSelectionItem =
  | { kind: "entity"; entityId: string }
  | { kind: "point"; entityId: string; subIndex: number }
  | { kind: "axis"; axis: SketchAxis }
  | { kind: "origin" };

export type SketchSelectionKind = SketchSelectionItem["kind"];

export function selectionKey(item: SketchSelectionItem): string {
  switch (item.kind) {
    case "entity":
      return `entity:${item.entityId}`;
    case "point":
      return `point:${item.entityId}:${item.subIndex}`;
    case "axis":
      return `axis:${item.axis}`;
    case "origin":
      return "origin";
  }
}

export function sameSelection(a: SketchSelectionItem, b: SketchSelectionItem): boolean {
  return selectionKey(a) === selectionKey(b);
}

export function toggleSelectionItem(items: SketchSelectionItem[], item: SketchSelectionItem): SketchSelectionItem[] {
  return items.some((i) => sameSelection(i, item)) ? items.filter((i) => !sameSelection(i, item)) : [...items, item];
}

export function uniqueSelection(items: SketchSelectionItem[]): SketchSelectionItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = selectionKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function selectionRef(item: SketchSelectionItem): ConstraintRef {
  switch (item.kind) {
    case "entity":
      return { entity_id: item.entityId, sub_index: 0 };
    case "point":
      return { entity_id: item.entityId, sub_index: item.subIndex };
    case "axis":
      return { entity_id: SKETCH_AXIS_IDS[item.axis], sub_index: 0 };
    case "origin":
      return { entity_id: SKETCH_ORIGIN_ID, sub_index: 0 };
  }
}

export function selectionOfAnchor(entityId: string, point: number | undefined): SketchSelectionItem {
  if (isSketchOrigin(entityId)) return { kind: "origin" };
  const axis = sketchAxisOf(entityId);
  if (axis) return { kind: "axis", axis };
  return point === undefined ? { kind: "entity", entityId } : { kind: "point", entityId, subIndex: point };
}

export function selectedEntityIds(items: SketchSelectionItem[]): string[] {
  return items.flatMap((item) => (item.kind === "entity" ? [item.entityId] : []));
}
