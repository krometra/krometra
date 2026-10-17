import type { ConstraintRef, ConstraintType, SketchConstraint } from "@/types/api";
import {
  angleDraft,
  defaultCursor,
  radiusDraft,
  resolveDimension,
  sameTarget,
  type DimensionDraft,
  type DimensionTarget,
} from "./dimensionPlan";
import { WHOLE_ENTITY } from "./solver/fixConstraint";

export type ConstraintPick = DimensionTarget;

const PER_OBJECT = new Set<ConstraintType>(["horizontal", "vertical"]);
const CHAINED = new Set<ConstraintType>(["coincident", "parallel", "equal", "collinear"]);

const isPoint = (pick: ConstraintPick) => pick.kind === "point";
const isLine = (pick: ConstraintPick) => pick.kind === "line";
const isSegment = (pick: ConstraintPick) => pick.kind === "line" && !pick.infinite;
const isRound = (pick: ConstraintPick) => pick.kind === "circle" || pick.kind === "arc";
const isCurve = (pick: ConstraintPick) => isLine(pick) || isRound(pick);
const objectRef = (pick: ConstraintPick): ConstraintRef => ({ entity_id: pick.ref.entity_id, sub_index: 0 });
const sameObject = (a: ConstraintPick, b: ConstraintPick) => a.ref.entity_id === b.ref.entity_id;

function pointOf(pick: ConstraintPick): ConstraintRef | null {
  if (isPoint(pick)) return { ...pick.ref };
  if (isRound(pick) || isSegment(pick)) return objectRef(pick);
  return null;
}

function exactCountBlocker(picks: ConstraintPick[], count: number, noun: string): string | null {
  return picks.length === count ? null : `только для ${noun}, выбрано ${picks.length}`;
}

function minCountBlocker(picks: ConstraintPick[]): string | null {
  return picks.length >= 2 ? null : "выберите два объекта или больше";
}

function linesOnlyBlocker(picks: ConstraintPick[]): string | null {
  return picks.every(isLine) ? null : "только отрезки и прямые";
}

function pointsOnlyBlocker(picks: ConstraintPick[]): string | null {
  if (picks.every(isPoint)) return null;
  return picks.some(isPoint) && picks.some(isCurve)
    ? "точку с кривой связывает «На кр» (точка на кривой)"
    : "только точки: концы, середины, центры, начало координат";
}

function sameKindBlocker(picks: ConstraintPick[]): string | null {
  return picks.every(isSegment) || picks.every(isRound) ? null : "только отрезки или только окружности и дуги";
}

function isPointPair(picks: ConstraintPick[]): boolean {
  return picks.length === 2 && picks.every(isPoint);
}

function alignmentBlocker(picks: ConstraintPick[]): string | null {
  if (picks.every(isLine)) return null;
  if (!isPointPair(picks)) return "только отрезки или две точки";
  return sameTarget(picks[0], picks[1]) ? "это та же точка" : null;
}

function midpointRoles(picks: ConstraintPick[]): [ConstraintPick, ConstraintPick] | null {
  if (picks.length !== 2) return null;
  const [first, second] = picks;
  if (isSegment(second) && pointOf(first)) return [first, second];
  if (isSegment(first) && (isPoint(second) || isRound(second))) return [second, first];
  return null;
}

function midpointBlocker(picks: ConstraintPick[]): string | null {
  const count = exactCountBlocker(picks, 2, "точки и отрезка");
  if (count) return count;
  const roles = midpointRoles(picks);
  if (!roles) return picks.some(isSegment) ? "вторым нужен отрезок, первым точка, отрезок или окружность" : "нужен отрезок";
  return sameObject(roles[0], roles[1]) ? "точка и отрезок должны быть разными объектами" : null;
}

function pointOnCurveBlocker(picks: ConstraintPick[]): string | null {
  const count = exactCountBlocker(picks, 2, "точки и кривой");
  if (count) return count;
  const [first, second] = picks;
  if (!pointOf(first)) return "первой нужна точка, отрезок или окружность";
  if (!isCurve(second)) return "второй нужна кривая: отрезок, прямая, окружность или дуга";
  return sameObject(first, second) ? "точка и кривая должны быть разными объектами" : null;
}

function fixBlocker(picks: ConstraintPick[]): string | null {
  return picks.every((pick) => isPoint(pick) || isRound(pick) || isSegment(pick)) ? null : "закрепляются точки, отрезки, окружности и дуги";
}

function distanceBlocker(picks: ConstraintPick[]): string | null {
  const resolution = resolveDimension(picks, defaultCursor(picks));
  if (resolution.status === "invalid") return resolution.reason;
  return resolution.status === "incomplete" ? resolution.hint : null;
}

export function toolbarDimension(type: ConstraintType, picks: ConstraintPick[]): DimensionDraft | null {
  const [first, second] = picks;
  if (type === "radius" && (first?.kind === "circle" || first?.kind === "arc")) return radiusDraft(first);
  if (type === "angle" && first?.kind === "line" && second?.kind === "line") return angleDraft(first, second, defaultCursor(picks));
  if (type !== "distance") return null;
  const resolution = resolveDimension(picks, defaultCursor(picks));
  return resolution.status === "ready" ? resolution.draft : null;
}

export function constraintBlocker(type: ConstraintType, picks: ConstraintPick[]): string | null {
  if (picks.length === 0) return "ничего не выбрано";
  switch (type) {
    case "horizontal":
    case "vertical":
      return alignmentBlocker(picks);
    case "coincident":
      return minCountBlocker(picks) ?? pointsOnlyBlocker(picks);
    case "parallel":
    case "collinear":
      return minCountBlocker(picks) ?? linesOnlyBlocker(picks);
    case "midpoint":
      return midpointBlocker(picks);
    case "point_on_curve":
      return pointOnCurveBlocker(picks);
    case "fix":
      return fixBlocker(picks);
    case "equal":
      return minCountBlocker(picks) ?? sameKindBlocker(picks);
    case "perpendicular":
    case "angle":
      return exactCountBlocker(picks, 2, "двух отрезков") ?? linesOnlyBlocker(picks);
    case "distance":
      return distanceBlocker(picks);
    case "radius":
      return exactCountBlocker(picks, 1, "одного объекта") ?? (isRound(picks[0]) ? null : "нужна окружность или дуга");
    default:
      return "неизвестное ограничение";
  }
}

function fixRef(pick: ConstraintPick): ConstraintRef {
  return isPoint(pick) ? { ...pick.ref } : { entity_id: pick.ref.entity_id, sub_index: WHOLE_ENTITY };
}

function incidenceGroups(type: ConstraintType, picks: ConstraintPick[]): ConstraintRef[][] | null {
  if (type === "fix") return picks.map((pick) => [fixRef(pick)]);
  if (type === "midpoint") {
    const roles = midpointRoles(picks);
    const point = roles && pointOf(roles[0]);
    return roles && point ? [[point, objectRef(roles[1])]] : [];
  }
  if (type === "point_on_curve") {
    const point = picks[0] && pointOf(picks[0]);
    return point && picks[1] ? [[point, objectRef(picks[1])]] : [];
  }
  return null;
}

function anchorGroups(type: ConstraintType, picks: ConstraintPick[]): ConstraintRef[][] {
  const incidence = incidenceGroups(type, picks);
  if (incidence) return incidence;
  const refs = picks.map((pick) => ({ ...pick.ref }));
  if (PER_OBJECT.has(type)) return isPointPair(picks) ? [refs] : refs.map((ref) => [ref]);
  if (CHAINED.has(type)) return refs.slice(1).map((ref, i) => [refs[i], ref]);
  return [refs];
}

export function planConstraints(
  type: ConstraintType,
  picks: ConstraintPick[],
  nextId: () => string,
): SketchConstraint[] {
  return anchorGroups(type, picks).map((anchors) => ({
    id: nextId(),
    type,
    anchors,
    value: null,
  }));
}
