import {
  rayAngleBetween,
  segLength,
  sideSign,
  signedLineDistance,
  signedPointLineDistance,
  unitDirection,
  unitNormal,
} from "../dimensionMeasure";
import {
  CONVERGENCE_THRESHOLD,
  LEARNING_RATE,
  anchorRay,
  anchorSegment,
  constraintSegments,
  getEntity,
  getPoint,
  updateArcPoints,
  type PointMap,
  type Segment,
} from "./pointMap";
import type { SketchConstraint, SketchEntity, SketchPoint } from "./types";

type Axis = "x" | "y";

function shift(p: SketchPoint, dx: number, dy: number) {
  p.x += dx;
  p.y += dy;
}

function shiftSegment(s: Segment, dx: number, dy: number) {
  shift(s.start, dx, dy);
  shift(s.end, dx, dy);
}

function pointPair(constraint: SketchConstraint, points: PointMap): [SketchPoint, SketchPoint] | null {
  if (constraint.anchors.length < 2) return null;
  const p0 = getPoint(points, constraint.anchors[0]);
  const p1 = getPoint(points, constraint.anchors[1]);
  return p0 && p1 ? [p0, p1] : null;
}

export function applyDistance(constraint: SketchConstraint, points: PointMap): number {
  const pair = pointPair(constraint, points);
  if (!pair || constraint.value === null) return 0;
  const [p0, p1] = pair;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const current = Math.hypot(dx, dy);
  if (current < 0.001) return 0;
  const correction = (constraint.value - current) * LEARNING_RATE * 0.5;
  shift(p0, (-dx / current) * correction, (-dy / current) * correction);
  shift(p1, (dx / current) * correction, (dy / current) * correction);
  return Math.abs(current - constraint.value);
}

export function applyAxisDistance(constraint: SketchConstraint, points: PointMap, axis: Axis): number {
  const pair = pointPair(constraint, points);
  if (!pair || constraint.value === null) return 0;
  const [p0, p1] = pair;
  const current = p1[axis] - p0[axis];
  const error = sideSign(current) * constraint.value - current;
  const half = error * LEARNING_RATE * 0.5;
  p0[axis] -= half;
  p1[axis] += half;
  return Math.abs(error);
}

function applyRoundRadius(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap, target: number): number {
  const entity = getEntity(entities, constraint.anchors[0]?.entity_id ?? "");
  if (!entity || (entity.type !== "circle" && entity.type !== "arc")) return 0;
  const current = entity.radius ?? 0;
  entity.radius = current + (target - current) * LEARNING_RATE;
  updateArcPoints(entity, points);
  return Math.abs(current - target);
}

export function applyRadius(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): number {
  if (constraint.value === null) return 0;
  return applyRoundRadius(constraint, entities, points, constraint.value);
}

export function applyDiameter(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): number {
  if (constraint.value === null) return 0;
  return applyRoundRadius(constraint, entities, points, constraint.value / 2) * 2;
}

export function applyLength(constraint: SketchConstraint, points: PointMap): number {
  const [segment] = constraintSegments(points, constraint, 1) ?? [];
  const dir = segment ? unitDirection(segment) : null;
  if (!segment || !dir || constraint.value === null) return 0;
  const error = constraint.value - segLength(segment);
  const half = error * LEARNING_RATE * 0.5;
  shift(segment.start, -dir.x * half, -dir.y * half);
  shift(segment.end, dir.x * half, dir.y * half);
  return Math.abs(error);
}

export function applyLineDistance(constraint: SketchConstraint, points: PointMap): number {
  const segments = constraintSegments(points, constraint, 2);
  if (!segments || constraint.value === null) return 0;
  const [base, other] = segments;
  const n = unitNormal(base);
  const current = signedLineDistance(base, other);
  if (!n || current === null) return 0;
  const error = sideSign(current) * constraint.value - current;
  const half = error * LEARNING_RATE * 0.5;
  shiftSegment(other, n.x * half, n.y * half);
  shiftSegment(base, -n.x * half, -n.y * half);
  return Math.abs(error);
}

function sharesPoint(point: SketchPoint, segment: Segment): boolean {
  return point === segment.start || point === segment.end;
}

export function applyPointLineDistance(constraint: SketchConstraint, points: PointMap): number {
  if (constraint.anchors.length < 2 || constraint.value === null) return 0;
  const point = getPoint(points, constraint.anchors[0]);
  const line = anchorSegment(points, constraint.anchors[1]);
  if (!point || !line || sharesPoint(point, line)) return 0;
  const n = unitNormal(line);
  const current = signedPointLineDistance(point, line);
  if (!n || current === null) return 0;
  const error = sideSign(current) * constraint.value - current;
  const half = error * LEARNING_RATE * 0.5;
  shift(point, n.x * half, n.y * half);
  shiftSegment(line, -n.x * half, -n.y * half);
  return Math.abs(error);
}

export function applyAngle(constraint: SketchConstraint, points: PointMap): number {
  if (constraint.anchors.length < 2 || constraint.value === null) return 0;
  const first = anchorRay(points, constraint.anchors[0]);
  const second = anchorRay(points, constraint.anchors[1]);
  if (!first || !second) return 0;
  const error = rayAngleBetween(first, second) - (constraint.value * Math.PI) / 180;
  if (Math.abs(error) < CONVERGENCE_THRESHOLD) return 0;
  const length = segLength(second);
  if (segLength(first) < 1 || length < 1) return 0;
  const angle = Math.atan2(second.end.y - second.start.y, second.end.x - second.start.x) - error * LEARNING_RATE;
  second.end.x = second.start.x + length * Math.cos(angle);
  second.end.y = second.start.y + length * Math.sin(angle);
  return Math.abs(error);
}

function lengthResidual(constraint: SketchConstraint, points: PointMap, value: number): number {
  const [segment] = constraintSegments(points, constraint, 1) ?? [];
  return segment ? Math.abs(segLength(segment) - value) : 0;
}

function pairResidual(constraint: SketchConstraint, points: PointMap, value: number, measure: (a: SketchPoint, b: SketchPoint) => number): number {
  const pair = pointPair(constraint, points);
  return pair ? Math.abs(measure(pair[0], pair[1]) - value) : 0;
}

function lineDistanceResidual(constraint: SketchConstraint, points: PointMap, value: number): number {
  const segments = constraintSegments(points, constraint, 2);
  const current = segments ? signedLineDistance(segments[0], segments[1]) : null;
  return current === null ? 0 : Math.abs(Math.abs(current) - value);
}

function pointLineResidual(constraint: SketchConstraint, points: PointMap, value: number): number {
  const point = constraint.anchors[0] ? getPoint(points, constraint.anchors[0]) : null;
  const line = constraint.anchors[1] ? anchorSegment(points, constraint.anchors[1]) : null;
  const current = point && line ? signedPointLineDistance(point, line) : null;
  return current === null ? 0 : Math.abs(Math.abs(current) - value);
}

function roundResidual(constraint: SketchConstraint, entities: SketchEntity[], value: number, scale: number): number {
  const entity = getEntity(entities, constraint.anchors[0]?.entity_id ?? "");
  return entity?.radius === undefined ? 0 : Math.abs(entity.radius * scale - value);
}

export function dimensionResidual(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): number {
  const value = constraint.value;
  if (value === null) return 0;
  switch (constraint.type) {
    case "distance":
      return pairResidual(constraint, points, value, (a, b) => Math.hypot(b.x - a.x, b.y - a.y));
    case "horizontal_distance":
      return pairResidual(constraint, points, value, (a, b) => Math.abs(b.x - a.x));
    case "vertical_distance":
      return pairResidual(constraint, points, value, (a, b) => Math.abs(b.y - a.y));
    case "length":
      return lengthResidual(constraint, points, value);
    case "line_distance":
      return lineDistanceResidual(constraint, points, value);
    case "point_line_distance":
      return pointLineResidual(constraint, points, value);
    case "radius":
      return roundResidual(constraint, entities, value, 1);
    case "diameter":
      return roundResidual(constraint, entities, value, 2);
    default:
      return 0;
  }
}
