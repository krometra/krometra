import type { ConstraintRef, ConstraintType, SketchConstraint, SketchEntity } from "@/types/api";
import {
  angleDraft,
  defaultCursor,
  radiusDraft,
  resolveDimension,
  type DimensionDraft,
  type DimensionTarget,
} from "./dimensionPlan";
import { targetOfEntity } from "./dimensionTargets";
import { WHOLE_ENTITY } from "./solver/fixConstraint";

export interface ConstraintPick {
  entity: SketchEntity;
  ref: ConstraintRef;
  point?: boolean;
}

const PER_OBJECT = new Set<ConstraintType>(["horizontal", "vertical"]);
const CHAINED = new Set<ConstraintType>(["coincident", "parallel", "equal", "collinear"]);

const isPoint = (pick: ConstraintPick) => pick.point === true;
const isLine = (pick: ConstraintPick) => !isPoint(pick) && pick.entity.type === "line";
const isRound = (pick: ConstraintPick) => !isPoint(pick) && (pick.entity.type === "circle" || pick.entity.type === "arc");
const isCurve = (pick: ConstraintPick) => isLine(pick) || isRound(pick);
const objectRef = (pick: ConstraintPick): ConstraintRef => ({ entity_id: pick.entity.id, sub_index: 0 });

function pointOf(pick: ConstraintPick): ConstraintRef | null {
  if (isPoint(pick)) return { ...pick.ref };
  return isCurve(pick) ? objectRef(pick) : null;
}

function midpointRoles(picks: ConstraintPick[]): [ConstraintPick, ConstraintPick] | null {
  if (picks.length !== 2) return null;
  const [first, second] = picks;
  if (isLine(second) && pointOf(first)) return [first, second];
  if (isLine(first) && (isPoint(second) || isRound(second))) return [second, first];
  return null;
}

function midpointBlocker(picks: ConstraintPick[]): string | null {
  const count = exactCountBlocker(picks, 2, "точки и отрезка");
  if (count) return count;
  const roles = midpointRoles(picks);
  if (!roles) return picks.some(isLine) ? "вторым нужен отрезок, первым точка, отрезок или окружность" : "нужен отрезок";
  return roles[0].entity.id === roles[1].entity.id ? "точка и отрезок должны быть разными объектами" : null;
}

function pointOnCurveBlocker(picks: ConstraintPick[]): string | null {
  const count = exactCountBlocker(picks, 2, "точки и кривой");
  if (count) return count;
  const [first, second] = picks;
  if (!pointOf(first)) return "первой нужна точка, отрезок или окружность";
  if (!isCurve(second)) return "второй нужна кривая: отрезок, окружность или дуга";
  return first.entity.id === second.entity.id ? "точка и кривая должны быть разными объектами" : null;
}

function fixBlocker(picks: ConstraintPick[]): string | null {
  return picks.every((pick) => isPoint(pick) || isCurve(pick)) ? null : "закрепляются точки, отрезки, окружности и дуги";
}

function exactCountBlocker(picks: ConstraintPick[], count: number, noun: string): string | null {
  return picks.length === count ? null : `только для ${noun}, выбрано ${picks.length}`;
}

function minCountBlocker(picks: ConstraintPick[]): string | null {
  return picks.length >= 2 ? null : "выберите два объекта или больше";
}

function linesOnlyBlocker(picks: ConstraintPick[]): string | null {
  return picks.every(isLine) ? null : "только отрезки";
}

function sameKindBlocker(picks: ConstraintPick[]): string | null {
  return picks.every(isLine) || picks.every(isRound) ? null : "только отрезки или только окружности и дуги";
}

function dimensionTargets(picks: ConstraintPick[]): DimensionTarget[] | null {
  const targets = picks.map((pick) => targetOfEntity(pick.entity));
  return targets.every((t): t is DimensionTarget => t !== null) ? targets : null;
}

function distanceBlocker(picks: ConstraintPick[]): string | null {
  const targets = dimensionTargets(picks);
  if (!targets) return "размер ставится на отрезки, окружности и дуги";
  const resolution = resolveDimension(targets, defaultCursor(targets));
  if (resolution.status === "invalid") return resolution.reason;
  return resolution.status === "incomplete" ? resolution.hint : null;
}

export function toolbarDimension(type: ConstraintType, picks: ConstraintPick[]): DimensionDraft | null {
  const targets = dimensionTargets(picks);
  if (!targets) return null;
  const [first, second] = targets;
  if (type === "radius" && (first?.kind === "circle" || first?.kind === "arc")) return radiusDraft(first);
  if (type === "angle" && first?.kind === "line" && second?.kind === "line") return angleDraft(first, second, defaultCursor(targets));
  if (type !== "distance") return null;
  const resolution = resolveDimension(targets, defaultCursor(targets));
  return resolution.status === "ready" ? resolution.draft : null;
}

export function constraintBlocker(type: ConstraintType, picks: ConstraintPick[]): string | null {
  if (picks.length === 0) return "ничего не выбрано";
  switch (type) {
    case "horizontal":
    case "vertical":
      return linesOnlyBlocker(picks);
    case "coincident":
      return minCountBlocker(picks);
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
  return isPoint(pick) ? { ...pick.ref } : { entity_id: pick.entity.id, sub_index: WHOLE_ENTITY };
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
  if (PER_OBJECT.has(type)) return refs.map((ref) => [ref]);
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
