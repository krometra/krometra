import type { ConstraintRef, SketchEntity, SketchPoint } from "@/types/api";
import type { Seg } from "./dimensionMeasure";
import { SKETCH_ORIGIN, isSketchOrigin, sketchAxisOf } from "./sketchOrigin";
import { axisSegment, entityLine, entityRefPoint } from "./sketchPoints";

export type EntityLookup = (id: string) => SketchEntity | undefined;

export function entityLookup(entities: SketchEntity[]): EntityLookup {
  const byId = new Map(entities.map((e) => [e.id, e]));
  return (id) => byId.get(id);
}

export function anchorPoint(lookup: EntityLookup, ref: ConstraintRef): SketchPoint | null {
  if (isSketchOrigin(ref.entity_id)) return { ...SKETCH_ORIGIN };
  const entity = lookup(ref.entity_id);
  return entity ? entityRefPoint(entity, ref.sub_index) : null;
}

export function anchorSegment(lookup: EntityLookup, ref: ConstraintRef): Seg | null {
  const axis = sketchAxisOf(ref.entity_id);
  if (axis) return axisSegment(axis);
  const entity = lookup(ref.entity_id);
  return entity ? entityLine(entity) : null;
}

export function anchorRay(lookup: EntityLookup, ref: ConstraintRef): Seg | null {
  const segment = anchorSegment(lookup, ref);
  if (!segment) return null;
  return ref.sub_index === 1 ? { start: segment.end, end: segment.start } : segment;
}

export function anchorRadius(lookup: EntityLookup, ref: ConstraintRef): { center: SketchPoint; radius: number } | null {
  const entity = lookup(ref.entity_id);
  return entity?.type === "circle" || entity?.type === "arc" ? { center: entity.center, radius: entity.radius } : null;
}
