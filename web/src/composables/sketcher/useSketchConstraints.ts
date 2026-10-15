import { ref, type Ref } from "vue";
import type {
  ConstraintRef,
  ConstraintType,
  SketchConstraint,
  SketchEntity,
} from "@/types/api";
import { constraintBlocker, planConstraints, type ConstraintPick } from "@/sketcher/constraintPlan";

export const CONSTRAINT_TYPES: ConstraintType[] = [
  "horizontal", "vertical", "coincident", "parallel", "perpendicular",
  "equal", "distance", "radius", "angle",
];

const CONSTRAINT_LABELS: Record<ConstraintType, string> = {
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

const CONSTRAINT_HINTS: Record<ConstraintType, string> = {
  horizontal: "Горизонтальность — выберите один или несколько отрезков",
  vertical: "Вертикальность — выберите один или несколько отрезков",
  coincident: "Совпадение — выберите два объекта или больше",
  parallel: "Параллельность — выберите два отрезка или больше",
  perpendicular: "Перпендикулярность — выберите два отрезка",
  equal: "Равенство — выберите отрезки или окружности и дуги",
  distance: "Расстояние — выберите два объекта",
  radius: "Радиус — выберите окружность или дугу",
  angle: "Угол — выберите два отрезка",
};

export function constraintLabel(type: ConstraintType): string {
  return CONSTRAINT_LABELS[type] ?? type;
}

interface DimensionalInput {
  visible: boolean;
  x: number;
  y: number;
  value: string;
  type: ConstraintType;
  anchors: ConstraintRef[];
}

/**
 * Применение ограничений к выбранным объектам: проверка применимости,
 * ввод размерных значений и создание записи.
 */
export function useSketchConstraints(deps: {
  entities: Ref<SketchEntity[]>;
  selectedEntityIds: Ref<string[]>;
  nextConstraintId: () => string;
  addConstraint: (constraint: SketchConstraint, opts?: { silent?: boolean }) => void;
  clearSelection: () => void;
  solveAndApply: () => void;
  canvasRect: () => DOMRect | undefined;
}) {
  const {
    entities,
    selectedEntityIds,
    nextConstraintId,
    addConstraint,
    clearSelection,
    solveAndApply,
    canvasRect,
  } = deps;

  const dimensionalInput = ref<DimensionalInput | null>(null);

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
    const reason = blocker(type);
    return reason ? `${CONSTRAINT_HINTS[type]} (недоступно: ${reason})` : CONSTRAINT_HINTS[type];
  }

  function openDimensionalInput(type: ConstraintType, anchors: ConstraintRef[]) {
    const rect = canvasRect();
    if (!rect) return;
    dimensionalInput.value = {
      visible: true,
      x: rect.left + rect.width / 2 - 50,
      y: rect.top + 100,
      value: "",
      type,
      anchors,
    };
  }

  function create(type: ConstraintType) {
    if (!canApply(type)) return;
    const picks = selectedPicks();

    if (type === "distance" || type === "radius" || type === "angle") {
      openDimensionalInput(type, picks.map((pick) => pick.ref));
      return;
    }

    for (const constraint of planConstraints(type, picks, nextConstraintId)) {
      addConstraint(constraint, { silent: true });
    }
    clearSelection();
    solveAndApply();
  }

  function confirmDimensional() {
    const input = dimensionalInput.value;
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val) || input.anchors.length === 0) {
      dimensionalInput.value = null;
      return;
    }

    addConstraint({
      id: nextConstraintId(),
      type: input.type,
      anchors: input.anchors,
      value: val,
    });
    clearSelection();
    dimensionalInput.value = null;
    solveAndApply();
  }

  function cancelDimensional() {
    dimensionalInput.value = null;
  }

  return {
    constraintTypes: CONSTRAINT_TYPES,
    dimensionalInput,
    canApply,
    title,
    label: constraintLabel,
    create,
    confirmDimensional,
    cancelDimensional,
  };
}

export type SketchConstraintsApi = ReturnType<typeof useSketchConstraints>;
