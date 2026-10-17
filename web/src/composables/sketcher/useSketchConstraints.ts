import type { ConstraintType, SketchConstraint } from "@/types/api";
import { constraintBlocker, planConstraints, toolbarDimension, type ConstraintPick } from "@/sketcher/constraintPlan";
import type { DimensionDraft, DimensionTarget } from "@/sketcher/dimensionPlan";

const TOOLBAR_TYPES = [
  "horizontal", "vertical", "coincident", "parallel", "perpendicular",
  "equal", "collinear", "midpoint", "point_on_curve", "fix",
  "distance", "radius", "angle",
] as const;

type ToolbarConstraintType = (typeof TOOLBAR_TYPES)[number];

export const CONSTRAINT_TYPES: ConstraintType[] = [...TOOLBAR_TYPES];

const CONSTRAINT_LABELS: Record<ToolbarConstraintType, string> = {
  horizontal: "Гор",
  vertical: "Вер",
  coincident: "Совп",
  parallel: "∥",
  perpendicular: "⊥",
  equal: "=",
  collinear: "Колл",
  midpoint: "Сер",
  point_on_curve: "На кр",
  fix: "Фикс",
  distance: "↔",
  radius: "R",
  angle: "∠",
};

const CONSTRAINT_HINTS: Record<ToolbarConstraintType, string> = {
  horizontal: "Горизонтальность — выберите отрезки или две точки",
  vertical: "Вертикальность — выберите отрезки или две точки",
  coincident: "Совпадение — выберите две точки или больше: концы, середины, центры, начало координат",
  parallel: "Параллельность — выберите два отрезка или больше",
  perpendicular: "Перпендикулярность — выберите два отрезка",
  equal: "Равенство — выберите отрезки или окружности и дуги",
  collinear: "Коллинеарность — выберите два отрезка или больше: они встанут на одну прямую",
  midpoint: "Середина — точку и отрезок; для окружности её центр, для двух отрезков начало первого",
  point_on_curve: "Точка на кривой — первым точку (у отрезка начало, у окружности центр), вторым отрезок, окружность или дугу",
  fix: "Зафиксировать — выбранные объекты целиком или точки останутся на месте",
  distance: "Размер (D) — длина отрезка, расстояние между параллельными, угол, диаметр",
  radius: "Радиус — выберите окружность или дугу",
  angle: "Угол — выберите два отрезка",
};

const isToolbarType = (type: ConstraintType): type is ToolbarConstraintType =>
  (TOOLBAR_TYPES as readonly ConstraintType[]).includes(type);

export function constraintLabel(type: ConstraintType): string {
  return isToolbarType(type) ? CONSTRAINT_LABELS[type] : type;
}

export function useSketchConstraints(deps: {
  selectionTargets: () => (DimensionTarget | null)[];
  nextConstraintId: () => string;
  addConstraint: (constraint: SketchConstraint, opts?: { silent?: boolean }) => void;
  clearSelection: () => void;
  solveAndApply: () => void;
  openDimension: (draft: DimensionDraft) => void;
}) {
  const {
    selectionTargets,
    nextConstraintId,
    addConstraint,
    clearSelection,
    solveAndApply,
    openDimension,
  } = deps;

  function selectedPicks(): ConstraintPick[] | null {
    const targets = selectionTargets();
    return targets.every((t): t is DimensionTarget => t !== null) ? targets : null;
  }

  function blocker(type: ConstraintType): string | null {
    const picks = selectedPicks();
    return picks ? constraintBlocker(type, picks) : "выделение устарело или объект не участвует в ограничениях";
  }

  function canApply(type: ConstraintType): boolean {
    return blocker(type) === null;
  }

  function title(type: ConstraintType): string {
    const hint = isToolbarType(type) ? CONSTRAINT_HINTS[type] : type;
    const reason = blocker(type);
    return reason ? `${hint} (недоступно: ${reason})` : hint;
  }

  function create(type: ConstraintType) {
    const picks = selectedPicks();
    if (!picks || constraintBlocker(type, picks) !== null) return;
    const draft = toolbarDimension(type, picks);
    if (draft) {
      openDimension(draft);
      return;
    }

    for (const constraint of planConstraints(type, picks, nextConstraintId)) {
      addConstraint(constraint, { silent: true });
    }
    clearSelection();
    solveAndApply();
  }

  return {
    constraintTypes: CONSTRAINT_TYPES,
    canApply,
    title,
    label: constraintLabel,
    create,
  };
}

export type SketchConstraintsApi = ReturnType<typeof useSketchConstraints>;
