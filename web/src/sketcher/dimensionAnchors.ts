import type { ConstraintRef, SketchEntity, SketchPoint } from "@/types/api";
import type { Seg } from "./dimensionMeasure";
import { SKETCH_ORIGIN, isSketchOrigin } from "./sketchOrigin";

export type EntityLookup = (id: string) => SketchEntity | undefined;

export function entityLookup(entities: SketchEntity[]): EntityLookup {
  const byId = new Map(entities.map((e) => [e.id, e]));
  return (id) => byId.get(id);
}

function onCircle(center: SketchPoint, radius: number, angle: number): SketchPoint {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

function entityAnchorPoint(entity: SketchEntity, subIndex: number): SketchPoint | null {
  switch (entity.type) {
    case "line":
      return subIndex === 1 ? entity.end : entity.start;
    case "circle":
      return subIndex === 1 ? onCircle(entity.center, entity.radius, 0) : entity.center;
    case "arc":
      if (subIndex === 1) return onCircle(entity.center, entity.radius, entity.startAngle);
      if (subIndex === 2) return onCircle(entity.center, entity.radius, entity.endAngle);
      return entity.center;
    case "rectangle":
      return [entity.corner1, entity.corner2, { x: entity.corner2.x, y: entity.corner1.y }, { x: entity.corner1.x, y: entity.corner2.y }][subIndex] ?? null;
    default:
      return null;
  }
}

export function anchorPoint(lookup: EntityLookup, ref: ConstraintRef): SketchPoint | null {
  if (isSketchOrigin(ref.entity_id)) return { ...SKETCH_ORIGIN };
  const entity = lookup(ref.entity_id);
  return entity ? entityAnchorPoint(entity, ref.sub_index) : null;
}

export function anchorSegment(lookup: EntityLookup, ref: ConstraintRef): Seg | null {
  const entity = lookup(ref.entity_id);
  return entity?.type === "line" ? { start: entity.start, end: entity.end } : null;
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
