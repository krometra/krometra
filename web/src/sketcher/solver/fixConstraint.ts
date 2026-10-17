import { isFixedReference } from "../sketchOrigin";
import { getEntity, getPoint, movingPoints, shiftPoints, type PointMap } from "./pointMap";
import type { ConstraintRef, SketchConstraint, SketchEntity, SketchPoint } from "./types";

export const WHOLE_ENTITY = -1;

const POINT_COUNT: Record<SketchEntity["type"], number> = { line: 2, circle: 2, arc: 3, rectangle: 4, infline: 2 };
const REFERENCE_POINT_COUNT = 2;

interface PointPin {
  anchor: SketchPoint;
  x: number;
  y: number;
  moving: SketchPoint[];
}

interface RadiusPin {
  entity: SketchEntity;
  radius: number;
}

export interface Pins {
  points: PointPin[];
  radii: RadiusPin[];
}

function pinPoint(anchor: SketchPoint, moving: SketchPoint[]): PointPin {
  return { anchor, x: anchor.x, y: anchor.y, moving };
}

function pinWhole(entity: SketchEntity, points: PointMap, pins: Pins) {
  for (let i = 0; i < POINT_COUNT[entity.type]; i++) {
    const point = getPoint(points, { entity_id: entity.id, sub_index: i });
    if (point) pins.points.push(pinPoint(point, [point]));
  }
  if (entity.radius !== undefined) pins.radii.push({ entity, radius: entity.radius });
}

function pinAnchor(ref: ConstraintRef, entities: SketchEntity[], points: PointMap, pins: Pins) {
  if (ref.sub_index === WHOLE_ENTITY) {
    const entity = getEntity(entities, ref.entity_id);
    if (entity) pinWhole(entity, points, pins);
    return;
  }
  const point = getPoint(points, ref);
  if (point) pins.points.push(pinPoint(point, movingPoints(points, entities, ref)));
}

function pinReference(entityId: string, entities: SketchEntity[], points: PointMap, pins: Pins) {
  const entity = getEntity(entities, entityId);
  if (entity) {
    pinWhole(entity, points, pins);
    return;
  }
  for (let i = 0; i < REFERENCE_POINT_COUNT; i++) {
    const point = getPoint(points, { entity_id: entityId, sub_index: i });
    if (point) pins.points.push(pinPoint(point, [point]));
  }
}

function referencedFixedIds(constraints: SketchConstraint[]): Set<string> {
  return new Set(constraints.flatMap((c) => c.anchors.map((a) => a.entity_id)).filter(isFixedReference));
}

export function collectPins(constraints: SketchConstraint[], entities: SketchEntity[], points: PointMap): Pins {
  const pins: Pins = { points: [], radii: [] };
  for (const constraint of constraints) {
    if (constraint.type !== "fix") continue;
    for (const ref of constraint.anchors) pinAnchor(ref, entities, points, pins);
  }
  for (const entityId of referencedFixedIds(constraints)) pinReference(entityId, entities, points, pins);
  return pins;
}

export function restorePins(pins: Pins) {
  for (const pin of pins.points) {
    const dx = pin.x - pin.anchor.x;
    const dy = pin.y - pin.anchor.y;
    if (dx !== 0 || dy !== 0) shiftPoints(pin.moving, dx, dy);
  }
  for (const pin of pins.radii) pin.entity.radius = pin.radius;
}
