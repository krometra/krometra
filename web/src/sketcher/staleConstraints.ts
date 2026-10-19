import type { ConstraintRef, SketchConstraint, SketchEntity } from "@/types/api";
import { LINE_MIDPOINT } from "./sketchPoints";
import { WHOLE_ENTITY } from "./solver/fixConstraint";

export interface EntityEdit {
  entityId: string;
  movedSubs: number[];
  lengthChanged: boolean;
}

const ALL_POINTS = new Set(["coincident", "distance", "horizontal_distance", "vertical_distance"]);
const POINT_FIRST = new Set(["midpoint", "point_on_curve", "point_line_distance", "tangent"]);
const LENGTH_BOUND = new Set(["length", "equal"]);

export function isPointAnchor(constraint: SketchConstraint, index: number): boolean {
  const { type, anchors } = constraint;
  if (ALL_POINTS.has(type)) return true;
  if (POINT_FIRST.has(type)) return index === 0;
  if (type === "horizontal" || type === "vertical") return anchors.length >= 2;
  if (type === "fix") return anchors[index]?.sub_index !== WHOLE_ENTITY;
  return false;
}

function anchorIsStale(constraint: SketchConstraint, ref: ConstraintRef, index: number, edit: EntityEdit, entity: SketchEntity | undefined): boolean {
  if (!isPointAnchor(constraint, index)) return LENGTH_BOUND.has(constraint.type) && entity?.type === "line" && edit.lengthChanged;
  if (edit.movedSubs.includes(ref.sub_index)) return true;
  return ref.sub_index === LINE_MIDPOINT && entity?.type === "line" && edit.lengthChanged;
}

export function dropStaleConstraints(
  constraints: SketchConstraint[],
  edits: EntityEdit[],
  entities: SketchEntity[],
): SketchConstraint[] {
  const editOf = new Map(edits.map((e) => [e.entityId, e]));
  const entityOf = new Map(entities.map((e) => [e.id, e]));
  return constraints.filter((c) =>
    !c.anchors.some((ref, i) => {
      const edit = editOf.get(ref.entity_id);
      return edit !== undefined && anchorIsStale(c, ref, i, edit, entityOf.get(ref.entity_id));
    }),
  );
}

export function movePointAnchors(
  constraints: SketchConstraint[],
  from: ConstraintRef,
  to: ConstraintRef,
): SketchConstraint[] {
  return constraints.map((c) => {
    const anchors = c.anchors.map((ref, i) =>
      isPointAnchor(c, i) && ref.entity_id === from.entity_id && ref.sub_index === from.sub_index ? { ...to } : ref,
    );
    return anchors.some((ref, i) => ref !== c.anchors[i]) ? { ...c, anchors } : c;
  });
}

export function withoutEntity(constraints: SketchConstraint[], entityId: string): SketchConstraint[] {
  return constraints.filter((c) => !c.anchors.some((a) => a.entity_id === entityId));
}
