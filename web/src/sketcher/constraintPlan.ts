import type { ConstraintRef, ConstraintType, SketchConstraint, SketchEntity } from "@/types/api";

export interface ConstraintPick {
  entity: SketchEntity;
  ref: ConstraintRef;
}

const PER_OBJECT = new Set<ConstraintType>(["horizontal", "vertical"]);
const CHAINED = new Set<ConstraintType>(["coincident", "parallel", "equal"]);

const isLine = (pick: ConstraintPick) => pick.entity.type === "line";
const isRound = (pick: ConstraintPick) => pick.entity.type === "circle" || pick.entity.type === "arc";

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

export function constraintBlocker(type: ConstraintType, picks: ConstraintPick[]): string | null {
  if (picks.length === 0) return "ничего не выбрано";
  switch (type) {
    case "horizontal":
    case "vertical":
      return linesOnlyBlocker(picks);
    case "coincident":
      return minCountBlocker(picks);
    case "parallel":
      return minCountBlocker(picks) ?? linesOnlyBlocker(picks);
    case "equal":
      return minCountBlocker(picks) ?? sameKindBlocker(picks);
    case "perpendicular":
    case "angle":
      return exactCountBlocker(picks, 2, "двух отрезков") ?? linesOnlyBlocker(picks);
    case "distance":
      return exactCountBlocker(picks, 2, "двух объектов");
    case "radius":
      return exactCountBlocker(picks, 1, "одного объекта") ?? (isRound(picks[0]) ? null : "нужна окружность или дуга");
    default:
      return "неизвестное ограничение";
  }
}

function anchorGroups(type: ConstraintType, refs: ConstraintRef[]): ConstraintRef[][] {
  if (PER_OBJECT.has(type)) return refs.map((ref) => [ref]);
  if (CHAINED.has(type)) return refs.slice(1).map((ref, i) => [refs[i], ref]);
  return [refs];
}

export function planConstraints(
  type: ConstraintType,
  picks: ConstraintPick[],
  nextId: () => string,
): SketchConstraint[] {
  return anchorGroups(type, picks.map((pick) => ({ ...pick.ref }))).map((anchors) => ({
    id: nextId(),
    type,
    anchors,
    value: null,
  }));
}
