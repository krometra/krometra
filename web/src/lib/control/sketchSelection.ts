import type { ConstraintType, SketchConstraint, SketchEntity } from "@/types/api";
import { constraintBlocker, planConstraints, toolbarDimension } from "@/sketcher/constraintPlan";
import { dimensionRangeError, type DimensionType } from "@/sketcher/dimensionKinds";
import type { DimensionTarget } from "@/sketcher/dimensionPlan";
import { targetOfSelection } from "@/sketcher/dimensionTargets";
import { SKETCH_AXIS_IDS, SKETCH_ORIGIN_ID } from "@/sketcher/sketchOrigin";
import { LINE_MIDPOINT } from "@/sketcher/sketchPoints";
import { selectionOfAnchor, selectionRef, type SketchSelectionItem } from "@/sketcher/sketchSelection";
import { INVALID, isPlainObject, type ParamSpec } from "./params";
import { fail } from "./protocol";
import { canonicalAnchorId } from "./sketchConstraints";

export const SKETCH_SELECTION_HELP =
  "Элемент выделения — { entityId, point? }: без point выбирается объект целиком (отрезок, окружность, дуга, вспомогательная прямая, ребро грани), " +
  `с point — его точка: у отрезка 0 и 1 — концы, ${LINE_MIDPOINT} — середина; у окружности 0 — центр; у дуги 0 — центр, 1 и 2 — концы. ` +
  `Начало координат — "${SKETCH_ORIGIN_ID}" (или "origin"), оси — "${SKETCH_AXIS_IDS.x}" и "${SKETCH_AXIS_IDS.y}" (или "axis-x", "axis-y").`;

const MAX_ITEMS = 64;
const MAX_POINT = 3;

function readItem(value: unknown): SketchSelectionItem | typeof INVALID {
  if (!isPlainObject(value)) return INVALID;
  const rawId = typeof value.entityId === "number" ? String(value.entityId) : value.entityId;
  if (typeof rawId !== "string" || rawId.length === 0) return INVALID;
  const point = value.point;
  if (point !== undefined && (typeof point !== "number" || !Number.isInteger(point) || point < 0 || point > MAX_POINT)) return INVALID;
  return selectionOfAnchor(canonicalAnchorId(rawId), point);
}

export function sketchSelectionParam(description: string): ParamSpec<SketchSelectionItem[]> {
  return {
    type: "array",
    required: true,
    description,
    expected: `массив до ${MAX_ITEMS} элементов { entityId, point? }`,
    read: (value) => {
      if (!Array.isArray(value) || value.length > MAX_ITEMS) return INVALID;
      const items = value.map(readItem);
      return items.includes(INVALID) ? INVALID : (items as SketchSelectionItem[]);
    },
  };
}

export function selectionTargets(items: SketchSelectionItem[], entities: SketchEntity[]): DimensionTarget[] {
  return items.map((item) => {
    const target = targetOfSelection(item, entities);
    if (target) return target;
    const { entity_id, sub_index } = selectionRef(item);
    const exists = entities.some((e) => e.id === entity_id);
    throw exists
      ? fail("invalid_params", `У «${entity_id}» нет точки ${sub_index} или объект не участвует в ограничениях.`)
      : fail("not_found", `В эскизе нет сущности «${entity_id}».`);
  });
}

export function describeSelection(items: SketchSelectionItem[], entities: SketchEntity[]) {
  return items.map((item) => {
    const target = targetOfSelection(item, entities);
    const { entity_id, sub_index } = selectionRef(item);
    return {
      kind: item.kind,
      entityId: entity_id,
      point: item.kind === "point" ? sub_index : undefined,
      at: target?.kind === "point" ? target.at : undefined,
      label: target?.kind === "point" ? target.label : undefined,
    };
  });
}

function checkedValue(type: DimensionType, value: number): number {
  const error = dimensionRangeError(type, value);
  if (error) throw fail("invalid_params", error);
  return value;
}

export function selectionConstraints(
  input: { type: ConstraintType; targets: DimensionTarget[]; value?: number },
  nextId: () => string,
): SketchConstraint[] {
  const blocker = constraintBlocker(input.type, input.targets);
  if (blocker) throw fail("invalid_params", `${input.type} для выделения недоступно: ${blocker}.`);
  const draft = toolbarDimension(input.type, input.targets);
  if (draft) {
    const value = checkedValue(draft.type, input.value ?? draft.value);
    return [{ id: nextId(), type: draft.type, anchors: draft.anchors, value }];
  }
  if (input.value !== undefined) throw fail("invalid_params", `${input.type} — геометрическое ограничение, value не задаётся.`);
  return planConstraints(input.type, input.targets, nextId);
}
