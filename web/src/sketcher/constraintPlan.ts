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

export type ConstraintPick = DimensionTarget;

const PER_OBJECT = new Set<ConstraintType>(["horizontal", "vertical"]);
const CHAINED = new Set<ConstraintType>(["coincident", "parallel", "equal"]);

const isPoint = (pick: ConstraintPick) => pick.kind === "point";
const isLine = (pick: ConstraintPick) => pick.kind === "line";
const isSegment = (pick: ConstraintPick) => pick.kind === "line" && !pick.infinite;
const isRound = (pick: ConstraintPick) => pick.kind === "circle" || pick.kind === "arc";

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
  return picks.every(isPoint) ? null : "только точки: концы, середины, центры, начало координат";
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
      return minCountBlocker(picks) ?? linesOnlyBlocker(picks);
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

function anchorGroups(type: ConstraintType, picks: ConstraintPick[]): ConstraintRef[][] {
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
