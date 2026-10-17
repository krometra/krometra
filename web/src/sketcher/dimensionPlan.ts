import type { ConstraintRef, SketchPoint } from "@/types/api";
import {
  RAD_TO_DEG,
  areParallel,
  lineIntersection,
  rayAngleBetween,
  segLength,
  signedLineDistance,
  signedPointLineDistance,
  type Seg,
} from "./dimensionMeasure";
import type { DimensionType } from "./dimensionKinds";

export type DimensionTarget =
  | { kind: "point"; ref: ConstraintRef; at: SketchPoint; label?: string }
  | { kind: "line"; ref: ConstraintRef; segment: Seg; infinite?: boolean }
  | { kind: "circle" | "arc"; ref: ConstraintRef; center: SketchPoint; radius: number };

export type PointTarget = Extract<DimensionTarget, { kind: "point" }>;
export type LineTarget = Extract<DimensionTarget, { kind: "line" }>;
export type RoundTarget = Extract<DimensionTarget, { kind: "circle" | "arc" }>;

export interface DimensionDraft {
  type: DimensionType;
  anchors: ConstraintRef[];
  value: number;
}

export type DimensionPlacement = "immediate" | "cursor";

export type DimensionResolution =
  | { status: "incomplete"; hint: string }
  | { status: "invalid"; reason: string }
  | { status: "ready"; draft: DimensionDraft; placement: DimensionPlacement };

const POINT_EPS = 1e-9;

const ready = (draft: DimensionDraft, placement: DimensionPlacement): DimensionResolution => ({ status: "ready", draft, placement });
const invalid = (reason: string): DimensionResolution => ({ status: "invalid", reason });
const lineRef = (ref: ConstraintRef): ConstraintRef => ({ entity_id: ref.entity_id, sub_index: 0 });

export function sameTarget(a: DimensionTarget, b: DimensionTarget): boolean {
  return a.kind === b.kind && a.ref.entity_id === b.ref.entity_id && a.ref.sub_index === b.ref.sub_index;
}

function asPoint(target: DimensionTarget): PointTarget | null {
  if (target.kind === "point") return target;
  if (target.kind === "line") return null;
  return { kind: "point", ref: { entity_id: target.ref.entity_id, sub_index: 0 }, at: target.center };
}

export function lengthDraft(line: LineTarget): DimensionDraft {
  return { type: "length", anchors: [lineRef(line.ref)], value: segLength(line.segment) };
}

export function radiusDraft(round: RoundTarget): DimensionDraft {
  return { type: "radius", anchors: [lineRef(round.ref)], value: round.radius };
}

export function diameterDraft(round: RoundTarget): DimensionDraft {
  return { type: "diameter", anchors: [lineRef(round.ref)], value: round.radius * 2 };
}

function rayRef(ref: ConstraintRef, forward: boolean): ConstraintRef {
  return { entity_id: ref.entity_id, sub_index: forward ? 0 : 1 };
}

function reversed(segment: Seg): Seg {
  return { start: segment.end, end: segment.start };
}

export function angleDraft(a: LineTarget, b: LineTarget, cursor: SketchPoint): DimensionDraft {
  const corner = lineIntersection(a.segment, b.segment) ?? a.segment.start;
  const da = { x: a.segment.end.x - a.segment.start.x, y: a.segment.end.y - a.segment.start.y };
  const db = { x: b.segment.end.x - b.segment.start.x, y: b.segment.end.y - b.segment.start.y };
  const v = { x: cursor.x - corner.x, y: cursor.y - corner.y };
  const det = da.x * db.y - da.y * db.x;
  const forwardA = det === 0 || (v.x * db.y - v.y * db.x) / det >= 0;
  const forwardB = det === 0 || (da.x * v.y - da.y * v.x) / det >= 0;
  const rayA = forwardA ? a.segment : reversed(a.segment);
  const rayB = forwardB ? b.segment : reversed(b.segment);
  const angle = rayAngleBetween(rayA, rayB);
  const anchors = [rayRef(a.ref, forwardA), rayRef(b.ref, forwardB)];
  return {
    type: "angle",
    anchors: angle >= 0 ? anchors : [anchors[1], anchors[0]],
    value: Math.abs(angle) * RAD_TO_DEG,
  };
}

function lineLineDimension(a: LineTarget, b: LineTarget, cursor: SketchPoint): DimensionResolution {
  if (a.ref.entity_id === b.ref.entity_id) return invalid("это тот же отрезок");
  if (!areParallel(a.segment, b.segment)) return ready(angleDraft(a, b, cursor), "cursor");
  const [base, other] = a.infinite && !b.infinite ? [b, a] : [a, b];
  const distance = signedLineDistance(base.segment, other.segment);
  if (distance === null) return invalid("отрезок нулевой длины");
  return ready({ type: "line_distance", anchors: [lineRef(base.ref), lineRef(other.ref)], value: Math.abs(distance) }, "immediate");
}

function pointLineDimension(point: PointTarget, line: LineTarget): DimensionResolution {
  if (point.ref.entity_id === line.ref.entity_id) return invalid("точка лежит на этом же отрезке");
  const distance = signedPointLineDistance(point.at, line.segment);
  if (distance === null) return invalid("отрезок нулевой длины");
  if (Math.abs(distance) < POINT_EPS) return invalid("точка лежит на прямой");
  return ready({ type: "point_line_distance", anchors: [point.ref, lineRef(line.ref)], value: Math.abs(distance) }, "immediate");
}

export function pointPairType(p0: SketchPoint, p1: SketchPoint, cursor: SketchPoint): DimensionType {
  const insideX = cursor.x > Math.min(p0.x, p1.x) && cursor.x < Math.max(p0.x, p1.x);
  const insideY = cursor.y > Math.min(p0.y, p1.y) && cursor.y < Math.max(p0.y, p1.y);
  if (insideX && !insideY) return "horizontal_distance";
  if (insideY && !insideX) return "vertical_distance";
  return "distance";
}

function pointPairValue(type: DimensionType, p0: SketchPoint, p1: SketchPoint): number {
  if (type === "horizontal_distance") return Math.abs(p1.x - p0.x);
  if (type === "vertical_distance") return Math.abs(p1.y - p0.y);
  return Math.hypot(p1.x - p0.x, p1.y - p0.y);
}

function pointPointDimension(a: PointTarget, b: PointTarget, cursor: SketchPoint): DimensionResolution {
  if (sameTarget(a, b)) return invalid("это та же точка");
  if (Math.hypot(b.at.x - a.at.x, b.at.y - a.at.y) < POINT_EPS) return invalid("точки совпадают");
  const type = pointPairType(a.at, b.at, cursor);
  return ready({ type, anchors: [a.ref, b.ref], value: pointPairValue(type, a.at, b.at) }, "cursor");
}

function singleDimension(target: DimensionTarget): DimensionResolution {
  switch (target.kind) {
    case "line":
      return target.infinite ? { status: "incomplete", hint: "Выберите второй объект: точку или отрезок" } : ready(lengthDraft(target), "cursor");
    case "circle":
      return ready(diameterDraft(target), "immediate");
    case "arc":
      return ready(radiusDraft(target), "immediate");
    case "point":
      return { status: "incomplete", hint: "Выберите вторую точку или отрезок" };
  }
}

function pairDimension(a: DimensionTarget, b: DimensionTarget, cursor: SketchPoint): DimensionResolution {
  if (a.kind === "line" && b.kind === "line") return lineLineDimension(a, b, cursor);
  if (a.kind === "line") return pointLineDimension(asPoint(b)!, a);
  if (b.kind === "line") return pointLineDimension(asPoint(a)!, b);
  return pointPointDimension(asPoint(a)!, asPoint(b)!, cursor);
}

export function resolveDimension(targets: DimensionTarget[], cursor: SketchPoint): DimensionResolution {
  if (targets.length === 0) return { status: "incomplete", hint: "Размер: выберите отрезок, окружность, дугу или точку" };
  if (targets.length === 1) return singleDimension(targets[0]);
  if (targets.length === 2) return pairDimension(targets[0], targets[1], cursor);
  return invalid(`только для одного или двух объектов, выбрано ${targets.length}`);
}

export function targetCenter(target: DimensionTarget): SketchPoint {
  if (target.kind === "point") return target.at;
  if (target.kind === "line") {
    const { start, end } = target.segment;
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  }
  return target.center;
}

export function defaultCursor(targets: DimensionTarget[]): SketchPoint {
  const centers = targets.map(targetCenter);
  const sum = centers.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return centers.length === 0 ? sum : { x: sum.x / centers.length, y: sum.y / centers.length };
}
