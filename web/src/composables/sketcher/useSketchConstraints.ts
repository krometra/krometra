import { ref, type Ref } from "vue";
import type {
  ConstraintRef,
  ConstraintType,
  SketchConstraint,
  SketchEntity,
} from "@/types/api";

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
  horizontal: "Горизонтальность — выберите один отрезок",
  vertical: "Вертикальность — выберите один отрезок",
  coincident: "Совпадение — выберите два объекта",
  parallel: "Параллельность — выберите два отрезка",
  perpendicular: "Перпендикулярность — выберите два отрезка",
  equal: "Равенство — выберите два объекта одного типа",
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

  function canApply(type: ConstraintType): boolean {
    const sel = selectedEntityIds.value;
    if (sel.length === 0) return false;

    const selected = sel
      .map((id) => entities.value.find((e) => e.id === id))
      .filter(Boolean) as SketchEntity[];
    if (selected.length !== sel.length) return false;

    switch (type) {
      case "horizontal":
      case "vertical":
        return sel.length === 1 && selected[0].type === "line";
      case "radius":
        return sel.length === 1 && (selected[0].type === "circle" || selected[0].type === "arc");
      case "coincident":
      case "distance":
        return sel.length >= 2;
      case "parallel":
      case "perpendicular":
      case "angle":
        return sel.length === 2 && selected[0].type === "line" && selected[1].type === "line";
      case "equal":
        return sel.length === 2 && selected[0].type === selected[1].type;
      default:
        return false;
    }
  }

  function title(type: ConstraintType): string {
    const hint = CONSTRAINT_HINTS[type];
    return canApply(type) ? hint : `${hint} (недоступно)`;
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
    const sel = selectedEntityIds.value;
    if (sel.length === 0) return;

    const anchors: ConstraintRef[] = sel.map((entityId) => ({
      entity_id: entityId,
      sub_index: 0,
    }));

    if (type === "distance" || type === "radius" || type === "angle") {
      const required = type === "radius" ? 1 : 2;
      if (anchors.length < required) return;
      openDimensionalInput(type, anchors);
      return;
    }

    addConstraint({ id: nextConstraintId(), type, anchors, value: null });
    clearSelection();
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
