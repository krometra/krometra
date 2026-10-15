import type { SketchConstraint, SketchEntity, SketchPoint } from "@/types/api";
import {
  anchorPoint,
  anchorRadius,
  anchorRay,
  anchorSegment,
  entityLookup,
  type EntityLookup,
} from "./dimensionAnchors";
import { dimensionText, isDimensionType, type DimensionType } from "./dimensionKinds";
import { lineIntersection, rayAngleBetween, signedLineDistance, signedPointLineDistance, unitNormal } from "./dimensionMeasure";

export interface DimensionArc {
  center: SketchPoint;
  radius: number;
  from: number;
  to: number;
}

export interface DimensionLayout {
  constraintId: string;
  text: string;
  label: SketchPoint;
  segments: [SketchPoint, SketchPoint][];
  arc: DimensionArc | null;
}

const OFFSET_PX = 16;
const ANGLE_RADIUS_PX = 28;
const LABEL_CHAR_PX = 7;
const LABEL_PAD_PX = 12;
const LABEL_HEIGHT_PX = 18;

type Geometry = Omit<DimensionLayout, "constraintId" | "text">;

const mid = (a: SketchPoint, b: SketchPoint): SketchPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const plus = (p: SketchPoint, d: SketchPoint, k: number): SketchPoint => ({ x: p.x + d.x * k, y: p.y + d.y * k });

function pointPair(lookup: EntityLookup, c: SketchConstraint): [SketchPoint, SketchPoint] | null {
  if (c.anchors.length < 2) return null;
  const a = anchorPoint(lookup, c.anchors[0]);
  const b = anchorPoint(lookup, c.anchors[1]);
  return a && b ? [a, b] : null;
}

function alignedGeometry(lookup: EntityLookup, c: SketchConstraint): Geometry | null {
  const pair = pointPair(lookup, c);
  return pair ? { label: mid(pair[0], pair[1]), segments: [pair], arc: null } : null;
}

function horizontalGeometry(lookup: EntityLookup, c: SketchConstraint, unit: number): Geometry | null {
  const pair = pointPair(lookup, c);
  if (!pair) return null;
  const [a, b] = pair;
  const y = Math.max(a.y, b.y) + OFFSET_PX * unit;
  const left = { x: a.x, y };
  const right = { x: b.x, y };
  return { label: mid(left, right), segments: [[a, left], [b, right], [left, right]], arc: null };
}

function verticalGeometry(lookup: EntityLookup, c: SketchConstraint, unit: number): Geometry | null {
  const pair = pointPair(lookup, c);
  if (!pair) return null;
  const [a, b] = pair;
  const x = Math.max(a.x, b.x) + OFFSET_PX * unit;
  const low = { x, y: a.y };
  const high = { x, y: b.y };
  return { label: mid(low, high), segments: [[a, low], [b, high], [low, high]], arc: null };
}

function lengthGeometry(lookup: EntityLookup, c: SketchConstraint, unit: number): Geometry | null {
  const segment = c.anchors[0] ? anchorSegment(lookup, c.anchors[0]) : null;
  const n = segment ? unitNormal(segment) : null;
  if (!segment || !n) return null;
  const start = plus(segment.start, n, OFFSET_PX * unit);
  const end = plus(segment.end, n, OFFSET_PX * unit);
  return { label: mid(start, end), segments: [[segment.start, start], [segment.end, end], [start, end]], arc: null };
}

function lineDistanceGeometry(lookup: EntityLookup, c: SketchConstraint): Geometry | null {
  const base = c.anchors[0] ? anchorSegment(lookup, c.anchors[0]) : null;
  const other = c.anchors[1] ? anchorSegment(lookup, c.anchors[1]) : null;
  const n = base ? unitNormal(base) : null;
  const distance = base && other ? signedLineDistance(base, other) : null;
  if (!base || !n || distance === null) return null;
  const from = mid(base.start, base.end);
  const to = plus(from, n, distance);
  return { label: mid(from, to), segments: [[from, to]], arc: null };
}

function pointLineGeometry(lookup: EntityLookup, c: SketchConstraint): Geometry | null {
  const point = c.anchors[0] ? anchorPoint(lookup, c.anchors[0]) : null;
  const line = c.anchors[1] ? anchorSegment(lookup, c.anchors[1]) : null;
  const n = line ? unitNormal(line) : null;
  const distance = point && line ? signedPointLineDistance(point, line) : null;
  if (!point || !n || distance === null) return null;
  const foot = plus(point, n, -distance);
  return { label: mid(point, foot), segments: [[point, foot]], arc: null };
}

function roundGeometry(lookup: EntityLookup, c: SketchConstraint, across: boolean): Geometry | null {
  const round = c.anchors[0] ? anchorRadius(lookup, c.anchors[0]) : null;
  if (!round) return null;
  const dir = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  const rim = plus(round.center, dir, round.radius);
  const from = across ? plus(round.center, dir, -round.radius) : round.center;
  return { label: plus(round.center, dir, round.radius * 0.5), segments: [[from, rim]], arc: null };
}

function angleGeometry(lookup: EntityLookup, c: SketchConstraint, unit: number): Geometry | null {
  const first = c.anchors[0] ? anchorRay(lookup, c.anchors[0]) : null;
  const second = c.anchors[1] ? anchorRay(lookup, c.anchors[1]) : null;
  if (!first || !second) return null;
  const center = lineIntersection(first, second) ?? first.start;
  const from = Math.atan2(first.end.y - first.start.y, first.end.x - first.start.x);
  const to = from + rayAngleBetween(first, second);
  const radius = ANGLE_RADIUS_PX * unit;
  const bisector = (from + to) / 2;
  const label = plus(center, { x: Math.cos(bisector), y: Math.sin(bisector) }, radius + 14 * unit);
  return { label, segments: [], arc: { center, radius, from, to } };
}

function geometryOf(type: DimensionType, lookup: EntityLookup, c: SketchConstraint, unit: number): Geometry | null {
  switch (type) {
    case "distance": return alignedGeometry(lookup, c);
    case "horizontal_distance": return horizontalGeometry(lookup, c, unit);
    case "vertical_distance": return verticalGeometry(lookup, c, unit);
    case "length": return lengthGeometry(lookup, c, unit);
    case "line_distance": return lineDistanceGeometry(lookup, c);
    case "point_line_distance": return pointLineGeometry(lookup, c);
    case "radius": return roundGeometry(lookup, c, false);
    case "diameter": return roundGeometry(lookup, c, true);
    case "angle": return angleGeometry(lookup, c, unit);
  }
}

export function dimensionLayout(constraint: SketchConstraint, lookup: EntityLookup, unit: number): DimensionLayout | null {
  if (!isDimensionType(constraint.type)) return null;
  const geometry = geometryOf(constraint.type, lookup, constraint, unit);
  if (!geometry) return null;
  return { constraintId: constraint.id, text: dimensionText(constraint.type, constraint.value), ...geometry };
}

export function dimensionLayouts(constraints: SketchConstraint[], entities: SketchEntity[], unit: number): DimensionLayout[] {
  const lookup = entityLookup(entities);
  return constraints.flatMap((c) => dimensionLayout(c, lookup, unit) ?? []);
}

export function labelHalfSize(text: string, unit: number): { w: number; h: number } {
  return { w: ((text.length * LABEL_CHAR_PX + LABEL_PAD_PX) / 2) * unit, h: (LABEL_HEIGHT_PX / 2) * unit };
}

export function findDimensionLabelAt(
  constraints: SketchConstraint[],
  entities: SketchEntity[],
  world: SketchPoint,
  unit: number,
): string | null {
  const layouts = dimensionLayouts(constraints, entities, unit);
  for (let i = layouts.length - 1; i >= 0; i--) {
    const { label, text, constraintId } = layouts[i];
    const half = labelHalfSize(text, unit);
    if (Math.abs(world.x - label.x) <= half.w && Math.abs(world.y - label.y) <= half.h) return constraintId;
  }
  return null;
}
