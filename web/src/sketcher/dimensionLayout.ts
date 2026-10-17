import type { SketchConstraint, SketchEntity, SketchPoint } from "@/types/api";
import {
  anchorPoint,
  anchorRadius,
  anchorRay,
  anchorSegment,
  entityLookup,
  type EntityLookup,
} from "./dimensionAnchors";
import { isConstruction } from "./geometry";
import { dimensionText, isDimensionType, type DimensionType } from "./dimensionKinds";
import { arcArrows, dimensionLine, extensionLine, linearDimension, type DimensionArrow } from "./dimensionMarks";
import {
  lineIntersection,
  rayAngleBetween,
  signedLineDistance,
  signedPointLineDistance,
  unitDirection,
  unitNormal,
} from "./dimensionMeasure";

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
  lines: [SketchPoint, SketchPoint][];
  arrows: DimensionArrow[];
  arc: DimensionArc | null;
}

const OFFSET_PX = 24;
const ANGLE_RADIUS_PX = 32;
const LABEL_CHAR_PX = 7;
const LABEL_PAD_PX = 12;
const LABEL_HEIGHT_PX = 18;

type Geometry = Omit<DimensionLayout, "constraintId">;

interface LayoutContext {
  lookup: EntityLookup;
  bulk: (seeds: SketchPoint[], excludeId?: string) => SketchPoint | null;
}

const NEIGHBOR_TOL = 1e-3;

function entityCenter(e: SketchEntity): SketchPoint {
  switch (e.type) {
    case "line": return mid(e.start, e.end);
    case "rectangle": return mid(e.corner1, e.corner2);
    case "infline": return e.point;
    default: return e.center;
  }
}

function entityEnds(e: SketchEntity): SketchPoint[] {
  if (e.type === "line") return [e.start, e.end];
  if (e.type === "arc") return [plus(e.center, { x: Math.cos(e.startAngle), y: Math.sin(e.startAngle) }, e.radius), plus(e.center, { x: Math.cos(e.endAngle), y: Math.sin(e.endAngle) }, e.radius)];
  if (e.type === "rectangle") return [e.corner1, e.corner2, { x: e.corner2.x, y: e.corner1.y }, { x: e.corner1.x, y: e.corner2.y }];
  if (e.type === "infline") return [];
  return [e.center];
}

function bulkFinder(entities: SketchEntity[]): LayoutContext["bulk"] {
  return (seeds, excludeId) => {
    const touches = (e: SketchEntity) =>
      entityEnds(e).some((p) => seeds.some((q) => Math.abs(p.x - q.x) < NEIGHBOR_TOL && Math.abs(p.y - q.y) < NEIGHBOR_TOL));
    const centers = entities.filter((e) => e.id !== excludeId && !isConstruction(e) && touches(e)).map(entityCenter);
    if (centers.length === 0) return null;
    const sum = centers.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / centers.length, y: sum.y / centers.length };
  };
}

function awayFrom(n: SketchPoint, origin: SketchPoint, center: SketchPoint | null): SketchPoint {
  if (!center) return n;
  return dot(n, { x: center.x - origin.x, y: center.y - origin.y }) > 1e-9 ? { x: -n.x, y: -n.y } : n;
}

const mid = (a: SketchPoint, b: SketchPoint): SketchPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const plus = (p: SketchPoint, d: SketchPoint, k: number): SketchPoint => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const dot = (a: SketchPoint, b: SketchPoint) => a.x * b.x + a.y * b.y;

function pointPair({ lookup }: LayoutContext, c: SketchConstraint): [SketchPoint, SketchPoint] | null {
  if (c.anchors.length < 2) return null;
  const a = anchorPoint(lookup, c.anchors[0]);
  const b = anchorPoint(lookup, c.anchors[1]);
  return a && b ? [a, b] : null;
}

function linear(text: string, points: [SketchPoint, SketchPoint], ends: [SketchPoint, SketchPoint], unit: number): Geometry {
  return { text, ...linearDimension(points, ends, labelHalfSize(text, unit), unit), arc: null };
}

function offsetAlong(points: [SketchPoint, SketchPoint], n: SketchPoint, unit: number): [SketchPoint, SketchPoint] {
  return [plus(points[0], n, OFFSET_PX * unit), plus(points[1], n, OFFSET_PX * unit)];
}

function outwardNormal(a: SketchPoint, b: SketchPoint): SketchPoint | null {
  const n = unitNormal({ start: a, end: b });
  if (!n) return null;
  return n.y < -1e-9 || (Math.abs(n.y) <= 1e-9 && n.x < 0) ? { x: -n.x, y: -n.y } : n;
}

function alignedGeometry(ctx: LayoutContext, c: SketchConstraint, text: string, unit: number): Geometry | null {
  const pair = pointPair(ctx, c);
  const n = pair ? outwardNormal(pair[0], pair[1]) : null;
  if (!pair || !n) return null;
  const side = awayFrom(n, mid(pair[0], pair[1]), ctx.bulk(pair));
  return linear(text, pair, offsetAlong(pair, side, unit), unit);
}

function horizontalGeometry(ctx: LayoutContext, c: SketchConstraint, text: string, unit: number): Geometry | null {
  const pair = pointPair(ctx, c);
  if (!pair) return null;
  const [a, b] = pair;
  const center = ctx.bulk(pair);
  const below = center !== null && center.y > (a.y + b.y) / 2 + 1e-9;
  const y = below ? Math.min(a.y, b.y) - OFFSET_PX * unit : Math.max(a.y, b.y) + OFFSET_PX * unit;
  return linear(text, pair, [{ x: a.x, y }, { x: b.x, y }], unit);
}

function verticalGeometry(ctx: LayoutContext, c: SketchConstraint, text: string, unit: number): Geometry | null {
  const pair = pointPair(ctx, c);
  if (!pair) return null;
  const [a, b] = pair;
  const center = ctx.bulk(pair);
  const left = center !== null && center.x > (a.x + b.x) / 2 + 1e-9;
  const x = left ? Math.min(a.x, b.x) - OFFSET_PX * unit : Math.max(a.x, b.x) + OFFSET_PX * unit;
  return linear(text, pair, [{ x, y: a.y }, { x, y: b.y }], unit);
}

function lengthGeometry(ctx: LayoutContext, c: SketchConstraint, text: string, unit: number): Geometry | null {
  const segment = c.anchors[0] ? anchorSegment(ctx.lookup, c.anchors[0]) : null;
  const n = segment ? outwardNormal(segment.start, segment.end) : null;
  if (!segment || !n) return null;
  const pair: [SketchPoint, SketchPoint] = [segment.start, segment.end];
  const side = awayFrom(n, mid(segment.start, segment.end), ctx.bulk(pair, c.anchors[0].entity_id));
  return linear(text, pair, offsetAlong(pair, side, unit), unit);
}

function nearestEnd(line: { start: SketchPoint; end: SketchPoint }, to: SketchPoint): SketchPoint | null {
  const dir = unitDirection(line);
  if (!dir) return null;
  const t = dot({ x: to.x - line.start.x, y: to.y - line.start.y }, dir);
  const span = dot({ x: line.end.x - line.start.x, y: line.end.y - line.start.y }, dir);
  if (t >= -1e-9 && t <= span + 1e-9) return null;
  return t < 0 ? line.start : line.end;
}

function withLineExtensions(
  text: string,
  ends: [SketchPoint, SketchPoint],
  lines: ({ start: SketchPoint; end: SketchPoint } | null)[],
  unit: number,
): Geometry {
  const marks = dimensionLine(ends[0], ends[1], labelHalfSize(text, unit), unit, true, null);
  const extensions = lines.flatMap((line, i) => {
    const from = line ? nearestEnd(line, ends[i]) : null;
    const ext = from ? extensionLine(from, ends[i], unit) : null;
    return ext ? [ext] : [];
  });
  return { text, ...marks, lines: [...extensions, ...marks.lines], arc: null };
}

function overlapMid(base: { start: SketchPoint; end: SketchPoint }, other: { start: SketchPoint; end: SketchPoint }): SketchPoint {
  const dir = unitDirection(base);
  if (!dir) return mid(base.start, base.end);
  const t = (p: SketchPoint) => dot({ x: p.x - base.start.x, y: p.y - base.start.y }, dir);
  const baseSpan = [0, t(base.end)].sort((a, b) => a - b);
  const otherSpan = [t(other.start), t(other.end)].sort((a, b) => a - b);
  const lo = Math.max(baseSpan[0], otherSpan[0]);
  const hi = Math.min(baseSpan[1], otherSpan[1]);
  const at = lo <= hi ? (lo + hi) / 2 : (baseSpan[0] + baseSpan[1]) / 2;
  return plus(base.start, dir, at);
}

function lineDistanceGeometry({ lookup }: LayoutContext, c: SketchConstraint, text: string, unit: number): Geometry | null {
  const base = c.anchors[0] ? anchorSegment(lookup, c.anchors[0]) : null;
  const other = c.anchors[1] ? anchorSegment(lookup, c.anchors[1]) : null;
  const n = base ? unitNormal(base) : null;
  const distance = base && other ? signedLineDistance(base, other) : null;
  if (!base || !other || !n || distance === null) return null;
  const from = overlapMid(base, other);
  return withLineExtensions(text, [from, plus(from, n, distance)], [base, other], unit);
}

function pointLineGeometry({ lookup }: LayoutContext, c: SketchConstraint, text: string, unit: number): Geometry | null {
  const point = c.anchors[0] ? anchorPoint(lookup, c.anchors[0]) : null;
  const line = c.anchors[1] ? anchorSegment(lookup, c.anchors[1]) : null;
  const n = line ? unitNormal(line) : null;
  const distance = point && line ? signedPointLineDistance(point, line) : null;
  if (!point || !n || distance === null) return null;
  return withLineExtensions(text, [point, plus(point, n, -distance)], [null, line], unit);
}

function roundGeometry({ lookup }: LayoutContext, c: SketchConstraint, text: string, unit: number, across: boolean): Geometry | null {
  const round = c.anchors[0] ? anchorRadius(lookup, c.anchors[0]) : null;
  if (!round) return null;
  const dir = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  const rim = plus(round.center, dir, round.radius);
  const from = across ? plus(round.center, dir, -round.radius) : round.center;
  return { text, ...dimensionLine(from, rim, labelHalfSize(text, unit), unit, across, null), arc: null };
}

function angleGeometry({ lookup }: LayoutContext, c: SketchConstraint, text: string, unit: number): Geometry | null {
  const first = c.anchors[0] ? anchorRay(lookup, c.anchors[0]) : null;
  const second = c.anchors[1] ? anchorRay(lookup, c.anchors[1]) : null;
  if (!first || !second) return null;
  const center = lineIntersection(first, second) ?? first.start;
  const from = Math.atan2(first.end.y - first.start.y, first.end.x - first.start.x);
  const to = from + rayAngleBetween(first, second);
  const radius = ANGLE_RADIUS_PX * unit;
  const bisector = (from + to) / 2;
  const label = plus(center, { x: Math.cos(bisector), y: Math.sin(bisector) }, radius + 14 * unit);
  return { text, label, lines: [], arrows: arcArrows(center, radius, from, to), arc: { center, radius, from, to } };
}

function geometryOf(type: DimensionType, ctx: LayoutContext, c: SketchConstraint, unit: number): Geometry | null {
  const text = dimensionText(type, c.value);
  switch (type) {
    case "distance": return alignedGeometry(ctx, c, text, unit);
    case "horizontal_distance": return horizontalGeometry(ctx, c, text, unit);
    case "vertical_distance": return verticalGeometry(ctx, c, text, unit);
    case "length": return lengthGeometry(ctx, c, text, unit);
    case "line_distance": return lineDistanceGeometry(ctx, c, text, unit);
    case "point_line_distance": return pointLineGeometry(ctx, c, text, unit);
    case "radius": return roundGeometry(ctx, c, text, unit, false);
    case "diameter": return roundGeometry(ctx, c, text, unit, true);
    case "angle": return angleGeometry(ctx, c, text, unit);
  }
}

function dimensionLayout(constraint: SketchConstraint, ctx: LayoutContext, unit: number): DimensionLayout | null {
  if (!isDimensionType(constraint.type)) return null;
  const geometry = geometryOf(constraint.type, ctx, constraint, unit);
  if (!geometry) return null;
  return { constraintId: constraint.id, ...geometry };
}

export function dimensionLayouts(constraints: SketchConstraint[], entities: SketchEntity[], unit: number): DimensionLayout[] {
  const ctx = { lookup: entityLookup(entities), bulk: bulkFinder(entities) };
  return constraints.flatMap((c) => dimensionLayout(c, ctx, unit) ?? []);
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
