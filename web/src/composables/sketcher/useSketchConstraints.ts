import type { Ref } from "vue";
import type { ConstraintType, SketchConstraint, SketchEntity } from "@/types/api";
import { constraintBlocker, planConstraints, toolbarDimension, type ConstraintPick } from "@/sketcher/constraintPlan";
import type { DimensionDraft } from "@/sketcher/dimensionPlan";

const TOOLBAR_TYPES = [
  "horizontal", "vertical", "coincident", "parallel", "perpendicular",
  "equal", "distance", "radius", "angle",
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
  distance: "↔",
  radius: "R",
  angle: "∠",
};

const CONSTRAINT_HINTS: Record<ToolbarConstraintType, string> = {
  horizontal: "Горизонтальность — выберите один или несколько отрезков",
  vertical: "Вертикальность — выберите один или несколько отрезков",
  coincident: "Совпадение — выберите два объекта или больше",
  parallel: "Параллельность — выберите два отрезка или больше",
  perpendicular: "Перпендикулярность — выберите два отрезка",
  equal: "Равенство — выберите отрезки или окружности и дуги",
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
  entities: Ref<SketchEntity[]>;
  selectedEntityIds: Ref<string[]>;
  nextConstraintId: () => string;
  addConstraint: (constraint: SketchConstraint, opts?: { silent?: boolean }) => void;
  clearSelection: () => void;
  solveAndApply: () => void;
  openDimension: (draft: DimensionDraft) => void;
}) {
  const {
    entities,
    selectedEntityIds,
    nextConstraintId,
    addConstraint,
    clearSelection,
    solveAndApply,
    openDimension,
  } = deps;

  function selectedPicks(): ConstraintPick[] {
    return selectedEntityIds.value.flatMap((id) => {
      const entity = entities.value.find((e) => e.id === id);
      return entity ? [{ entity, ref: { entity_id: id, sub_index: 0 } }] : [];
    });
  }

  function blocker(type: ConstraintType): string | null {
    const picks = selectedPicks();
    if (picks.length !== selectedEntityIds.value.length) return "выделение устарело";
    return constraintBlocker(type, picks);
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
    if (!canApply(type)) return;
    const picks = selectedPicks();
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
