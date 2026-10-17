import type { SketchEntity, SketchPoint } from "@/types/api";
import { isAngleOnArc } from "./arcGeometry";
import { distanceToLineSegment, isConstruction } from "./geometry";
import { isSketchOrigin, type SketchAxis } from "./sketchOrigin";
import { pointRoleLabel, sketchPointHandles, type PointHandle } from "./sketchPoints";
import type { SketchSelectionItem } from "./sketchSelection";

export interface SketchPick {
  item: SketchSelectionItem;
  at: SketchPoint | null;
  label: string | null;
}

export const MIDPOINT_PICK_SCALE = 0.5;
export const POINT_PREFERENCE = 1 / 3;

const ARC_END_TOLERANCE = 0.1;
const TIE_EPS = 1e-9;

interface Hit<T> {
  value: T;
  distance: number;
}

function pointRadius(handle: PointHandle, threshold: number): number {
  return handle.role === "mid" ? threshold * MIDPOINT_PICK_SCALE : threshold;
}

export function pickSketchPoint(world: SketchPoint, entities: SketchEntity[], threshold: number): PointHandle | null {
  let best: Hit<PointHandle> | null = null;
  for (const handle of sketchPointHandles(entities)) {
    const distance = Math.hypot(handle.at.x - world.x, handle.at.y - world.y);
    if (distance >= pointRadius(handle, threshold)) continue;
    if (!best || distance < best.distance) best = { value: handle, distance };
  }
  return best?.value ?? null;
}

function rectangleDistance(world: SketchPoint, entity: Extract<SketchEntity, { type: "rectangle" }>): number {
  const dx = Math.max(Math.min(entity.corner1.x, entity.corner2.x) - world.x, 0, world.x - Math.max(entity.corner1.x, entity.corner2.x));
  const dy = Math.max(Math.min(entity.corner1.y, entity.corner2.y) - world.y, 0, world.y - Math.max(entity.corner1.y, entity.corner2.y));
  return Math.hypot(dx, dy);
}

export function entityDistance(world: SketchPoint, entity: SketchEntity): number {
  switch (entity.type) {
    case "line":
      return distanceToLineSegment(world, entity.start, entity.end);
    case "infline":
      return Math.abs((world.x - entity.point.x) * Math.sin(entity.angle) - (world.y - entity.point.y) * Math.cos(entity.angle));
    case "circle":
      return Math.abs(Math.hypot(world.x - entity.center.x, world.y - entity.center.y) - entity.radius);
    case "arc": {
      const angle = Math.atan2(world.y - entity.center.y, world.x - entity.center.x);
      if (!isAngleOnArc(angle, entity.startAngle, entity.endAngle, ARC_END_TOLERANCE)) return Infinity;
      return Math.abs(Math.hypot(world.x - entity.center.x, world.y - entity.center.y) - entity.radius);
    }
    case "rectangle":
      return rectangleDistance(world, entity);
  }
}

export function pickSketchEntity(world: SketchPoint, entities: SketchEntity[], threshold: number): SketchEntity | null {
  let best: Hit<SketchEntity> | null = null;
  for (const entity of entities) {
    const distance = entityDistance(world, entity);
    if (distance >= threshold) continue;
    if (!best || distance <= best.distance + TIE_EPS) best = { value: entity, distance };
  }
  return best?.value ?? null;
}

export function pickDrawableEntity(world: SketchPoint, entities: SketchEntity[], threshold: number): SketchEntity | null {
  return pickSketchEntity(world, entities.filter((e) => !isConstruction(e)), threshold);
}

export function pickSketchAxis(world: SketchPoint, threshold: number): SketchAxis | null {
  const toX = Math.abs(world.y);
  const toY = Math.abs(world.x);
  if (Math.min(toX, toY) >= threshold) return null;
  return toX <= toY ? "x" : "y";
}

function pointPick(handle: PointHandle): SketchPick {
  const item: SketchSelectionItem = isSketchOrigin(handle.ref.entity_id)
    ? { kind: "origin" }
    : { kind: "point", entityId: handle.ref.entity_id, subIndex: handle.ref.sub_index };
  return { item, at: handle.at, label: pointRoleLabel(handle.role) };
}

function pointWins(world: SketchPoint, point: PointHandle, entity: SketchEntity | null, threshold: number): boolean {
  if (!entity) return true;
  const toPoint = Math.hypot(point.at.x - world.x, point.at.y - world.y);
  return toPoint <= entityDistance(world, entity) + threshold * POINT_PREFERENCE;
}

export function pickSketchItem(world: SketchPoint, entities: SketchEntity[], threshold: number): SketchPick | null {
  const point = pickSketchPoint(world, entities, threshold);
  const entity = pickSketchEntity(world, entities, threshold);
  if (point && pointWins(world, point, entity, threshold)) return pointPick(point);
  if (entity) return { item: { kind: "entity", entityId: entity.id }, at: null, label: null };
  const axis = pickSketchAxis(world, threshold);
  return axis ? { item: { kind: "axis", axis }, at: null, label: null } : null;
}
