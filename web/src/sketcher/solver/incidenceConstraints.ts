import { signedPointLineDistance, unitNormal } from "../dimensionMeasure";
import {
  LEARNING_RATE,
  anchorSegment,
  getEntity,
  getPoint,
  movingPoints,
  shiftPoints,
  updateArcPoints,
  type PointMap,
  type Segment,
} from "./pointMap";
import type { ConstraintRef, SketchConstraint, SketchEntity, SketchPoint } from "./types";

const HALF_STEP = LEARNING_RATE * 0.5;

function shiftSegment(segment: Segment, dx: number, dy: number) {
  shiftPoints([segment.start, segment.end], dx, dy);
}

function ownsPoint(point: SketchPoint, segment: Segment): boolean {
  return point === segment.start || point === segment.end;
}

function pullToLine(moving: Segment, line: Segment): number {
  const n = unitNormal(line);
  if (!n) return 0;
  let error = 0;
  for (const p of [moving.start, moving.end]) {
    if (ownsPoint(p, line)) continue;
    const d = signedPointLineDistance(p, line) ?? 0;
    error = Math.max(error, Math.abs(d));
    shiftPoints([p], -n.x * d * HALF_STEP, -n.y * d * HALF_STEP);
  }
  return error;
}

export function applyCollinear(constraint: SketchConstraint, points: PointMap): number {
  if (constraint.anchors.length < 2) return 0;
  const a = anchorSegment(points, constraint.anchors[0]);
  const b = anchorSegment(points, constraint.anchors[1]);
  if (!a || !b) return 0;
  const errorB = pullToLine(b, a);
  const errorA = pullToLine(a, b);
  return Math.max(errorA, errorB);
}

export function applyMidpoint(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): number {
  if (constraint.anchors.length < 2) return 0;
  const point = getPoint(points, constraint.anchors[0]);
  const segment = anchorSegment(points, constraint.anchors[1]);
  if (!point || !segment || ownsPoint(point, segment)) return 0;
  const dx = (segment.start.x + segment.end.x) / 2 - point.x;
  const dy = (segment.start.y + segment.end.y) / 2 - point.y;
  shiftPoints(movingPoints(points, entities, constraint.anchors[0]), dx * HALF_STEP, dy * HALF_STEP);
  shiftSegment(segment, -dx * HALF_STEP, -dy * HALF_STEP);
  return Math.hypot(dx, dy);
}

function isRound(entity: SketchEntity | undefined): entity is SketchEntity {
  return entity?.type === "circle" || entity?.type === "arc";
}

function onLine(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap, point: SketchPoint): number {
  const line = anchorSegment(points, constraint.anchors[1]);
  const n = line ? unitNormal(line) : null;
  if (!line || !n || ownsPoint(point, line)) return 0;
  const d = signedPointLineDistance(point, line) ?? 0;
  shiftPoints(movingPoints(points, entities, constraint.anchors[0]), -n.x * d * HALF_STEP, -n.y * d * HALF_STEP);
  shiftSegment(line, n.x * d * HALF_STEP, n.y * d * HALF_STEP);
  return Math.abs(d);
}

function isOwnRoundPoint(ref: ConstraintRef, curve: ConstraintRef): boolean {
  return ref.entity_id === curve.entity_id;
}

function onRound(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap, point: SketchPoint, round: SketchEntity): number {
  const [ref, curve] = constraint.anchors;
  const center = getPoint(points, { entity_id: round.id, sub_index: 0 });
  if (!center || isOwnRoundPoint(ref, curve)) return 0;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9) return round.radius ?? 0;
  const error = distance - (round.radius ?? 0);
  const k = (error * HALF_STEP) / distance;
  shiftPoints(movingPoints(points, entities, ref), -dx * k, -dy * k);
  round.radius = (round.radius ?? 0) + error * HALF_STEP;
  updateArcPoints(round, points);
  return Math.abs(error);
}

export function applyPointOnCurve(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): number {
  if (constraint.anchors.length < 2) return 0;
  const point = getPoint(points, constraint.anchors[0]);
  const curve = getEntity(entities, constraint.anchors[1].entity_id);
  if (!point || !curve) return 0;
  if (curve.type === "line") return onLine(constraint, entities, points, point);
  if (isRound(curve)) return onRound(constraint, entities, points, point, curve);
  return 0;
}

function distanceToLine(p: SketchPoint | null, line: Segment | null): number {
  if (!p || !line || ownsPoint(p, line)) return 0;
  return Math.abs(signedPointLineDistance(p, line) ?? 0);
}

function collinearResidual(constraint: SketchConstraint, points: PointMap): number {
  const [first, second] = constraint.anchors;
  const a = first ? anchorSegment(points, first) : null;
  const b = second ? anchorSegment(points, second) : null;
  if (!a || !b) return 0;
  return Math.max(distanceToLine(b.start, a), distanceToLine(b.end, a));
}

function midpointResidual(constraint: SketchConstraint, points: PointMap): number {
  const [ref, segmentRef] = constraint.anchors;
  const point = ref ? getPoint(points, ref) : null;
  const segment = segmentRef ? anchorSegment(points, segmentRef) : null;
  if (!point || !segment || ownsPoint(point, segment)) return 0;
  return Math.hypot((segment.start.x + segment.end.x) / 2 - point.x, (segment.start.y + segment.end.y) / 2 - point.y);
}

function pointOnCurveResidual(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): number {
  const [ref, curveRef] = constraint.anchors;
  const point = ref ? getPoint(points, ref) : null;
  const curve = curveRef ? getEntity(entities, curveRef.entity_id) : undefined;
  if (!point || !curve || isOwnRoundPoint(ref, curveRef)) return 0;
  if (curve.type === "line") return distanceToLine(point, anchorSegment(points, curveRef));
  if (!isRound(curve) || !curve.center) return 0;
  return Math.abs(Math.hypot(point.x - curve.center.x, point.y - curve.center.y) - (curve.radius ?? 0));
}

export function incidenceResidual(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): number {
  switch (constraint.type) {
    case "collinear": return collinearResidual(constraint, points);
    case "midpoint": return midpointResidual(constraint, points);
    case "point_on_curve": return pointOnCurveResidual(constraint, entities, points);
    default: return 0;
  }
}
