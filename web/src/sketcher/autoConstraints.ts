import type { ConstraintRef, ConstraintType, SketchConstraint, SketchEntity, SketchPoint } from "@/types/api";
import type { SnapCandidate } from "./snapCandidates";

export type AutoConstraintKind =
  | "horizontal"
  | "vertical"
  | "perpendicular"
  | "parallel"
  | "tangent"
  | "coincident"
  | "midpoint"
  | "point_on_curve";

export type OwnPoint = "start" | "end";

export type PlannedAnchor = { own: OwnPoint | "curve" } | { other: ConstraintRef };

export interface PlannedConstraint {
  type: AutoConstraintKind;
  anchors: PlannedAnchor[];
}

export interface AutoPlan {
  end: SketchPoint;
  constraints: PlannedConstraint[];
}

export interface PlanOptions {
  supported: ReadonlySet<string>;
  angleTolerance: number;
  minLength: number;
}

export const AUTO_ANGLE_TOLERANCE = (4 * Math.PI) / 180;

export const AUTO_GLYPHS: Record<AutoConstraintKind, string> = {
  horizontal: "H",
  vertical: "V",
  perpendicular: "⊥",
  parallel: "∥",
  tangent: "⌒",
  coincident: "●",
  midpoint: "△",
  point_on_curve: "◦",
};

const FIXED_SNAPS = new Set(["endpoint", "center", "origin", "intersection", "midpoint", "quadrant", "perpendicular"]);

const ALIGN_EPS = 1e-6;

function pointSnapConstraint(own: OwnPoint, snap: SnapCandidate | null): PlannedConstraint | null {
  const ref = snap?.ref;
  if (!snap || !ref) return null;
  switch (snap.kind) {
    case "endpoint":
    case "center":
    case "origin":
      return { type: "coincident", anchors: [{ own }, { other: ref }] };
    case "midpoint":
      return { type: "midpoint", anchors: [{ own }, { other: ref }] };
    case "quadrant":
    case "on-line":
      return { type: "point_on_curve", anchors: [{ own }, { other: ref }] };
    default:
      return null;
  }
}

export function planPoint(own: OwnPoint, snap: SnapCandidate | null, supported: ReadonlySet<string>): PlannedConstraint[] {
  const planned = pointSnapConstraint(own, snap);
  return planned && supported.has(planned.type) ? [planned] : [];
}

interface Direction {
  type: AutoConstraintKind;
  dir: SketchPoint;
  other?: ConstraintRef;
}

const unit = (v: SketchPoint): SketchPoint => {
  const len = Math.hypot(v.x, v.y);
  return { x: v.x / len, y: v.y / len };
};

const perp = (v: SketchPoint): SketchPoint => ({ x: -v.y, y: v.x });

function lineDirection(entities: SketchEntity[], entityId: string): SketchPoint | null {
  const entity = entities.find((e) => e.id === entityId);
  if (entity?.type !== "line") return null;
  const d = { x: entity.end.x - entity.start.x, y: entity.end.y - entity.start.y };
  return Math.hypot(d.x, d.y) < 1e-12 ? null : unit(d);
}

function arcTangent(entities: SketchEntity[], ref: ConstraintRef): SketchPoint | null {
  const entity = entities.find((e) => e.id === ref.entity_id);
  if (entity?.type !== "arc" || (ref.sub_index !== 1 && ref.sub_index !== 2)) return null;
  const angle = ref.sub_index === 1 ? entity.startAngle : entity.endAngle;
  return { x: -Math.sin(angle), y: Math.cos(angle) };
}

function startDirections(startSnap: SnapCandidate | null, entities: SketchEntity[]): Direction[] {
  const ref = startSnap?.kind === "endpoint" ? startSnap.ref : undefined;
  if (!ref) return [];
  const along = lineDirection(entities, ref.entity_id);
  const line = { entity_id: ref.entity_id, sub_index: 0 };
  if (along) {
    return [
      { type: "perpendicular", dir: perp(along), other: line },
      { type: "parallel", dir: along, other: line },
    ];
  }
  const tangent = arcTangent(entities, ref);
  return tangent ? [{ type: "tangent", dir: tangent, other: { entity_id: ref.entity_id, sub_index: 0 } }] : [];
}

function deviation(v: SketchPoint, dir: SketchPoint): number {
  const cross = Math.abs(v.x * dir.y - v.y * dir.x);
  const dot = Math.abs(v.x * dir.x + v.y * dir.y);
  return Math.atan2(cross, dot);
}

function directionConstraint(direction: Direction): PlannedConstraint {
  const anchors: PlannedAnchor[] = [{ own: "curve" }];
  if (direction.other) anchors.push({ other: direction.other });
  return { type: direction.type, anchors };
}

function inferDirection(
  start: SketchPoint,
  end: SketchPoint,
  startSnap: SnapCandidate | null,
  entities: SketchEntity[],
  options: PlanOptions,
): { end: SketchPoint; constraint: PlannedConstraint } | null {
  const v = { x: end.x - start.x, y: end.y - start.y };
  if (Math.hypot(v.x, v.y) < options.minLength) return null;
  const candidates: Direction[] = [
    { type: "horizontal", dir: { x: 1, y: 0 } },
    { type: "vertical", dir: { x: 0, y: 1 } },
    ...startDirections(startSnap, entities),
  ];
  for (const direction of candidates) {
    if (!options.supported.has(direction.type)) continue;
    if (deviation(v, direction.dir) > options.angleTolerance) continue;
    const t = v.x * direction.dir.x + v.y * direction.dir.y;
    return {
      end: { x: start.x + direction.dir.x * t, y: start.y + direction.dir.y * t },
      constraint: directionConstraint(direction),
    };
  }
  return null;
}

function exactAlignment(start: SketchPoint, end: SketchPoint, supported: ReadonlySet<string>): PlannedConstraint[] {
  const scale = Math.max(1, Math.abs(start.x), Math.abs(start.y), Math.abs(end.x), Math.abs(end.y));
  const tolerance = ALIGN_EPS * scale;
  if (Math.abs(end.y - start.y) < tolerance && supported.has("horizontal")) {
    return [{ type: "horizontal", anchors: [{ own: "curve" }] }];
  }
  if (Math.abs(end.x - start.x) < tolerance && supported.has("vertical")) {
    return [{ type: "vertical", anchors: [{ own: "curve" }] }];
  }
  return [];
}

export function planLineEnd(
  input: {
    start: SketchPoint;
    startSnap: SnapCandidate | null;
    end: SketchPoint;
    endSnap: SnapCandidate | null;
    entities: SketchEntity[];
  },
  options: PlanOptions,
): AutoPlan {
  const { start, startSnap, end, endSnap, entities } = input;
  if (endSnap && FIXED_SNAPS.has(endSnap.kind)) {
    return {
      end,
      constraints: [...exactAlignment(start, end, options.supported), ...planPoint("end", endSnap, options.supported)],
    };
  }
  const inferred = inferDirection(start, end, startSnap, entities, options);
  if (inferred) return { end: inferred.end, constraints: [inferred.constraint] };
  return { end, constraints: planPoint("end", endSnap, options.supported) };
}

export function glyphsOf(constraints: PlannedConstraint[]): string[] {
  return [...new Set(constraints.map((c) => AUTO_GLYPHS[c.type]))];
}

export type OwnResolver = (own: OwnPoint | "curve") => ConstraintRef | null;

export function materializeConstraints(
  planned: PlannedConstraint[],
  resolveOwn: OwnResolver,
  makeId: () => string,
): SketchConstraint[] {
  const out: SketchConstraint[] = [];
  for (const c of planned) {
    const anchors = c.anchors.map((anchor) => ("own" in anchor ? resolveOwn(anchor.own) : { ...anchor.other }));
    if (anchors.some((anchor) => anchor === null)) continue;
    out.push({ id: makeId(), type: c.type as ConstraintType, anchors: anchors as ConstraintRef[], value: null });
  }
  return out;
}

export function endReached(produced: SketchEntity[], resolve: OwnResolver, at: SketchPoint, tolerance: number): boolean {
  const ref = resolve("end");
  const entity = ref && produced.find((e) => e.id === ref.entity_id);
  if (!ref || entity?.type !== "line") return false;
  const point = ref.sub_index === 0 ? entity.start : entity.end;
  return Math.hypot(point.x - at.x, point.y - at.y) <= tolerance;
}

export function ownAnchorsFor(tool: string, produced: SketchEntity[]): OwnResolver | null {
  const [first] = produced;
  if (!first) return null;
  const point = (entity: SketchEntity | undefined, subIndex: number): ConstraintRef | null =>
    entity ? { entity_id: entity.id, sub_index: subIndex } : null;
  switch (tool) {
    case "line":
      return first.type === "line" ? (own) => point(first, own === "end" ? 1 : 0) : null;
    case "rectangle":
      return produced.length === 4 ? (own) => (own === "curve" ? null : point(produced[own === "start" ? 0 : 2], 0)) : null;
    case "circle":
    case "arc":
      return (own) => (own === "start" ? point(first, 0) : null);
    default:
      return null;
  }
}
