import {
  CONVERGENCE_THRESHOLD,
  LEARNING_RATE,
  constraintSegments,
  getEntity,
  getPoint,
  movingPoints,
  shiftPoints,
  updateArcPoints,
  type PointMap,
  type Segment,
} from "./pointMap";
import type { SketchConstraint, SketchEntity } from "./types";

const segmentAngle = (s: Segment) => Math.atan2(s.end.y - s.start.y, s.end.x - s.start.x);
const segmentLength = (s: Segment) => Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y);

function wrapHalfTurn(angle: number): number {
  let result = angle;
  while (result > Math.PI / 2) result -= Math.PI;
  while (result < -Math.PI / 2) result += Math.PI;
  return result;
}

function rotateEnd(segment: Segment, angle: number, length: number) {
  segment.end.x = segment.start.x + length * Math.cos(angle);
  segment.end.y = segment.start.y + length * Math.sin(angle);
}

export function alignedPair(constraint: SketchConstraint, points: PointMap): Segment | null {
  if (constraint.anchors.length >= 2) {
    const start = getPoint(points, constraint.anchors[0]);
    const end = getPoint(points, constraint.anchors[1]);
    return start && end ? { start, end } : null;
  }
  const [segment] = constraintSegments(points, constraint, 1) ?? [];
  return segment ?? null;
}

function alignAxis(constraint: SketchConstraint, points: PointMap, axis: "x" | "y"): number {
  const pair = alignedPair(constraint, points);
  if (!pair) return 0;
  const delta = Math.abs(pair.start[axis] - pair.end[axis]);
  const avg = (pair.start[axis] + pair.end[axis]) / 2;
  pair.start[axis] = avg;
  pair.end[axis] = avg;
  return delta;
}

export function applyHorizontal(constraint: SketchConstraint, points: PointMap): number {
  return alignAxis(constraint, points, "y");
}

export function applyVertical(constraint: SketchConstraint, points: PointMap): number {
  return alignAxis(constraint, points, "x");
}

export function applyCoincident(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): number {
  if (constraint.anchors.length < 2) return 0;
  const p0 = getPoint(points, constraint.anchors[0]);
  const p1 = getPoint(points, constraint.anchors[1]);
  if (!p0 || !p1) return 0;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const k = 0.5 * LEARNING_RATE;
  shiftPoints(movingPoints(points, entities, constraint.anchors[0]), dx * k, dy * k);
  shiftPoints(movingPoints(points, entities, constraint.anchors[1]), -dx * k, -dy * k);
  return Math.hypot(dx, dy);
}

function alignDirections(constraint: SketchConstraint, points: PointMap, offset: number): number {
  const segments = constraintSegments(points, constraint, 2);
  if (!segments) return 0;
  const [a, b] = segments;
  const angleA = segmentAngle(a);
  const angleB = segmentAngle(b);
  const diff = wrapHalfTurn(angleB - angleA - offset);
  if (Math.abs(diff) < CONVERGENCE_THRESHOLD) return 0;
  const lengthA = segmentLength(a);
  const lengthB = segmentLength(b);
  if (lengthA < 1 || lengthB < 1) return 0;
  const half = diff * 0.5 * LEARNING_RATE;
  rotateEnd(a, angleA + half, lengthA);
  rotateEnd(b, angleB - half, lengthB);
  return Math.abs(diff);
}

export function applyParallel(constraint: SketchConstraint, points: PointMap): number {
  return alignDirections(constraint, points, 0);
}

export function applyPerpendicular(constraint: SketchConstraint, points: PointMap): number {
  return alignDirections(constraint, points, Math.PI / 2);
}

function equalLines(constraint: SketchConstraint, points: PointMap): number {
  const segments = constraintSegments(points, constraint, 2);
  if (!segments) return 0;
  const [a, b] = segments;
  const lengthA = segmentLength(a);
  const lengthB = segmentLength(b);
  const avg = (lengthA + lengthB) / 2;
  if (avg < 1) return 0;
  for (const [segment, length] of [[a, lengthA], [b, lengthB]] as const) {
    const scale = 1 + (avg / length - 1) * LEARNING_RATE;
    segment.end.x = segment.start.x + (segment.end.x - segment.start.x) * scale;
    segment.end.y = segment.start.y + (segment.end.y - segment.start.y) * scale;
  }
  return Math.abs(lengthA - lengthB);
}

const isRound = (e: SketchEntity) => e.type === "circle" || e.type === "arc";

function equalRadii(a: SketchEntity, b: SketchEntity, points: PointMap): number {
  const ra = a.radius ?? 0;
  const rb = b.radius ?? 0;
  const avg = (ra + rb) / 2;
  if (avg < 1) return 0;
  a.radius = ra + (avg - ra) * LEARNING_RATE;
  b.radius = rb + (avg - rb) * LEARNING_RATE;
  updateArcPoints(a, points);
  updateArcPoints(b, points);
  return Math.abs(ra - rb);
}

export function applyEqual(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): number {
  if (constraint.anchors.length < 2) return 0;
  const a = getEntity(entities, constraint.anchors[0].entity_id);
  const b = getEntity(entities, constraint.anchors[1].entity_id);
  if (!a || !b) return 0;
  if (a.type === "line" && b.type === "line") return equalLines(constraint, points);
  if (isRound(a) && isRound(b)) return equalRadii(a, b, points);
  return 0;
}
