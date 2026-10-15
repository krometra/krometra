import { shallowRef } from "vue";
import type { SketchConstraint } from "@/types/api";
import type { Quantity } from "@/lib/units";
import { useQuantityField, type QuantityField } from "@/composables/editor/useQuantityField";
import {
  dimensionQuantity,
  dimensionRangeError,
  dimensionTitle,
  isDimensionType,
  type DimensionType,
} from "@/sketcher/dimensionKinds";
import type { DimensionDraft } from "@/sketcher/dimensionPlan";

export interface ScreenPoint {
  x: number;
  y: number;
}

type DimensionCommit = { kind: "create"; draft: DimensionDraft } | { kind: "edit"; constraintId: string };

export interface DimensionInputState {
  x: number;
  y: number;
  title: string;
  field: QuantityField;
  commit: DimensionCommit;
}

export function useDimensionInput(deps: {
  variables: () => Record<string, Quantity>;
  create: (draft: DimensionDraft, value: number) => void;
  update: (constraintId: string, value: number) => void;
}) {
  const state = shallowRef<DimensionInputState | null>(null);

  function open(type: DimensionType, initial: number, at: ScreenPoint, commit: DimensionCommit) {
    state.value = {
      x: at.x,
      y: at.y,
      title: dimensionTitle(type),
      field: useQuantityField({
        dimension: dimensionQuantity(type),
        initial,
        variables: deps.variables,
        rangeError: (value) => dimensionRangeError(type, value),
      }),
      commit,
    };
  }

  function openCreate(draft: DimensionDraft, at: ScreenPoint) {
    open(draft.type, draft.value, at, { kind: "create", draft });
  }

  function openEdit(constraint: SketchConstraint, at: ScreenPoint): boolean {
    if (!isDimensionType(constraint.type) || constraint.value === null) return false;
    open(constraint.type, constraint.value, at, { kind: "edit", constraintId: constraint.id });
    return true;
  }

  function type(text: string) {
    const field = state.value?.field;
    if (!field) return;
    field.text.value = text;
    field.onInput();
  }

  function confirm() {
    const current = state.value;
    if (!current) return;
    current.field.commit();
    if (current.field.invalid.value) return;
    const value = current.field.value.value;
    state.value = null;
    if (current.commit.kind === "create") deps.create(current.commit.draft, value);
    else deps.update(current.commit.constraintId, value);
  }

  function cancel() {
    state.value = null;
  }

  return { state, openCreate, openEdit, type, confirm, cancel };
}

export type DimensionInputApi = ReturnType<typeof useDimensionInput>;
