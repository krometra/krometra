import type { SketchEntity, SketchPoint } from "@/types/api";
import { isAngleOnArc } from "./arcGeometry";
import { distanceToLineSegment, isConstruction } from "./geometry";
import type { DimensionTarget, PointTarget } from "./dimensionPlan";
import { SKETCH_ORIGIN, SKETCH_ORIGIN_ID } from "./sketchOrigin";

const pointTarget = (entityId: string, subIndex: number, at: SketchPoint, label: string): PointTarget => ({
  kind: "point",
  ref: { entity_id: entityId, sub_index: subIndex },
  at,
  label,
});

function arcEnd(entity: Extract<SketchEntity, { type: "arc" }>, angle: number): SketchPoint {
  return { x: entity.center.x + entity.radius * Math.cos(angle), y: entity.center.y + entity.radius * Math.sin(angle) };
}

function entityPoints(entity: SketchEntity): PointTarget[] {
  switch (entity.type) {
    case "line":
      return [pointTarget(entity.id, 0, entity.start, "Конец"), pointTarget(entity.id, 1, entity.end, "Конец")];
    case "circle":
      return [pointTarget(entity.id, 0, entity.center, "Центр")];
    case "arc":
      return [
        pointTarget(entity.id, 0, entity.center, "Центр"),
        pointTarget(entity.id, 1, arcEnd(entity, entity.startAngle), "Конец"),
        pointTarget(entity.id, 2, arcEnd(entity, entity.endAngle), "Конец"),
      ];
    default:
      return [];
  }
}

export function targetOfEntity(entity: SketchEntity): DimensionTarget | null {
  const ref = { entity_id: entity.id, sub_index: 0 };
  switch (entity.type) {
    case "line":
      return { kind: "line", ref, segment: { start: entity.start, end: entity.end } };
    case "circle":
    case "arc":
      return { kind: entity.type, ref, center: entity.center, radius: entity.radius };
    default:
      return null;
  }
}

export function dimensionPointTargets(entities: SketchEntity[]): PointTarget[] {
  const own = entities.filter((e) => !isConstruction(e)).flatMap(entityPoints);
  return [...own, pointTarget(SKETCH_ORIGIN_ID, 0, { ...SKETCH_ORIGIN }, "Начало координат")];
}

interface Hit<T> {
  target: T;
  distance: number;
}

const POINT_PREFERENCE = 1 / 3;

function nearestPoint(world: SketchPoint, entities: SketchEntity[], threshold: number): Hit<PointTarget> | null {
  let best: Hit<PointTarget> | null = null;
  for (const target of dimensionPointTargets(entities)) {
    const distance = Math.hypot(target.at.x - world.x, target.at.y - world.y);
    if (distance < threshold && (!best || distance < best.distance)) best = { target, distance };
  }
  return best;
}

function curveDistance(world: SketchPoint, entity: SketchEntity): number {
  switch (entity.type) {
    case "line":
      return distanceToLineSegment(world, entity.start, entity.end);
    case "circle":
      return Math.abs(Math.hypot(world.x - entity.center.x, world.y - entity.center.y) - entity.radius);
    case "arc": {
      const angle = Math.atan2(world.y - entity.center.y, world.x - entity.center.x);
      if (!isAngleOnArc(angle, entity.startAngle, entity.endAngle, 0)) return Infinity;
      return Math.abs(Math.hypot(world.x - entity.center.x, world.y - entity.center.y) - entity.radius);
    }
    default:
      return Infinity;
  }
}

function nearestCurve(world: SketchPoint, entities: SketchEntity[], threshold: number): Hit<DimensionTarget> | null {
  let best: Hit<DimensionTarget> | null = null;
  for (const entity of entities) {
    if (isConstruction(entity)) continue;
    const distance = curveDistance(world, entity);
    const target = targetOfEntity(entity);
    if (target && distance < threshold && (!best || distance <= best.distance)) best = { target, distance };
  }
  return best;
}

export function pickDimensionTarget(world: SketchPoint, entities: SketchEntity[], threshold: number): DimensionTarget | null {
  const point = nearestPoint(world, entities, threshold);
  const curve = nearestCurve(world, entities, threshold);
  if (point && (!curve || point.distance <= curve.distance + threshold * POINT_PREFERENCE)) return point.target;
  return curve?.target ?? null;
}
