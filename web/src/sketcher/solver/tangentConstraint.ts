import { signedPointLineDistance, unitDirection, unitNormal } from "../dimensionMeasure";
import { LEARNING_RATE, anchorSegment, getEntity, getPoint, shiftPoints, type PointMap, type Segment } from "./pointMap";
import type { SketchConstraint, SketchEntity, SketchPoint } from "./types";

const HALF_STEP = LEARNING_RATE * 0.5;

interface TangentParts {
  center: SketchPoint;
  touch: SketchPoint;
  line: Segment;
  radius: number;
}

function tangentParts(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): TangentParts | null {
  const [touchRef, lineRef] = constraint.anchors;
  if (!touchRef || !lineRef) return null;
  const arc = getEntity(entities, touchRef.entity_id);
  if (arc?.type !== "arc" || arc.radius === undefined) return null;
  const center = getPoint(points, { entity_id: arc.id, sub_index: 0 });
  const touch = getPoint(points, touchRef);
  const line = anchorSegment(points, lineRef);
  return center && touch && line ? { center, touch, line, radius: arc.radius } : null;
}

function errors({ center, touch, line, radius }: TangentParts) {
  const u = unitDirection(line);
  const offset = signedPointLineDistance(center, line);
  if (!u || offset === null) return null;
  const side = offset < 0 ? -1 : 1;
  return {
    u,
    normal: side * radius - offset,
    along: (center.x - touch.x) * u.x + (center.y - touch.y) * u.y,
  };
}

export function applyTangent(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): number {
  const parts = tangentParts(constraint, entities, points);
  const n = parts ? unitNormal(parts.line) : null;
  const e = parts ? errors(parts) : null;
  if (!parts || !n || !e) return 0;
  shiftPoints([parts.center], n.x * e.normal * HALF_STEP, n.y * e.normal * HALF_STEP);
  shiftPoints([parts.touch], e.u.x * e.along * HALF_STEP, e.u.y * e.along * HALF_STEP);
  return Math.max(Math.abs(e.normal), Math.abs(e.along));
}

export function tangentResidual(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): number {
  if (constraint.type !== "tangent") return 0;
  const parts = tangentParts(constraint, entities, points);
  const e = parts ? errors(parts) : null;
  return e ? Math.max(Math.abs(e.normal), Math.abs(e.along)) : 0;
}
