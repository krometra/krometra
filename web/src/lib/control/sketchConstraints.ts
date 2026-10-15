import type { ConstraintRef, ConstraintType, SketchConstraint, SketchEntity } from "@/types/api";
import { dimensionRangeError, isDimensionType } from "@/sketcher/dimensionKinds";
import { SKETCH_ORIGIN_ID } from "@/sketcher/sketchOrigin";
import { INVALID, isPlainObject, type ParamSpec } from "./params";
import { fail } from "./protocol";

type Kind = "line" | "round" | "point" | "any";

const SIGNATURES: Record<ConstraintType, Kind[]> = {
  horizontal: ["line"],
  vertical: ["line"],
  coincident: ["point", "point"],
  parallel: ["line", "line"],
  perpendicular: ["line", "line"],
  equal: ["any", "any"],
  distance: ["point", "point"],
  horizontal_distance: ["point", "point"],
  vertical_distance: ["point", "point"],
  length: ["line"],
  line_distance: ["line", "line"],
  point_line_distance: ["point", "line"],
  radius: ["round"],
  diameter: ["round"],
  angle: ["line", "line"],
};

export const CONSTRAINT_TYPE_NAMES = Object.keys(SIGNATURES) as ConstraintType[];

export const SKETCH_CONSTRAINT_HELP =
  "Ограничение эскиза. Геометрические (без value): horizontal, vertical [отрезок]; parallel, perpendicular [отрезок, отрезок]; " +
  "coincident [точка, точка]; equal [два отрезка или две окружности/дуги]. Размерные (value обязателен, мм или градусы): " +
  "length [отрезок] — длина; line_distance [отрезок, отрезок] — расстояние между параллельными; " +
  "point_line_distance [точка, отрезок] — перпендикулярное расстояние; distance [точка, точка] — наклонное; " +
  "horizontal_distance и vertical_distance [точка, точка] — по X и по Y, сторона сохраняется по текущему положению; " +
  "radius и diameter [окружность или дуга]; angle [отрезок, отрезок] — угол в градусах от первого луча ко второму против часовой. " +
  `Якорь — { entityId, point? }. point у отрезка: 0 — начало, 1 — конец (у angle 1 — луч от конца к началу); у окружности и дуги 0 — центр, у дуги 1 и 2 — концы. ` +
  `Начало координат эскиза — entityId "${SKETCH_ORIGIN_ID}" (или "origin").`;

export interface ConstraintAnchorInput {
  entityId: string;
  point: number;
}

function readAnchor(value: unknown): ConstraintAnchorInput | typeof INVALID {
  if (!isPlainObject(value)) return INVALID;
  const entityId = typeof value.entityId === "number" ? String(value.entityId) : value.entityId;
  const point = value.point ?? 0;
  if (typeof entityId !== "string" || entityId.length === 0) return INVALID;
  if (typeof point !== "number" || !Number.isInteger(point) || point < 0 || point > 3) return INVALID;
  return { entityId: entityId === "origin" ? SKETCH_ORIGIN_ID : entityId, point };
}

export function constraintAnchorsParam(description: string): ParamSpec<ConstraintAnchorInput[]> {
  return {
    type: "array",
    required: true,
    description,
    expected: "массив из одного или двух якорей { entityId, point? }",
    read: (value) => {
      if (!Array.isArray(value) || value.length < 1 || value.length > 2) return INVALID;
      const anchors = value.map(readAnchor);
      return anchors.includes(INVALID) ? INVALID : (anchors as ConstraintAnchorInput[]);
    },
  };
}

function kindOf(entity: SketchEntity | undefined, anchor: ConstraintAnchorInput): Kind[] {
  if (anchor.entityId === SKETCH_ORIGIN_ID) return anchor.point === 0 ? ["point", "any"] : [];
  if (!entity) return [];
  if (entity.type === "line") return anchor.point <= 1 ? ["line", "point", "any"] : [];
  if (entity.type === "circle") return anchor.point <= 1 ? ["round", "point", "any"] : [];
  if (entity.type === "arc") return anchor.point <= 2 ? ["round", "point", "any"] : [];
  return [];
}

const KIND_NAMES: Record<Kind, string> = {
  line: "отрезок",
  round: "окружность или дуга",
  point: "точка",
  any: "объект",
};

function checkAnchors(type: ConstraintType, anchors: ConstraintAnchorInput[], entities: SketchEntity[]) {
  const signature = SIGNATURES[type];
  if (anchors.length !== signature.length) {
    throw fail("invalid_params", `${type}: нужно якорей ${signature.length}, передано ${anchors.length}.`);
  }
  anchors.forEach((anchor, i) => {
    const entity = entities.find((e) => e.id === anchor.entityId);
    if (!entity && anchor.entityId !== SKETCH_ORIGIN_ID) throw fail("not_found", `В эскизе нет сущности «${anchor.entityId}».`);
    if (!kindOf(entity, anchor).includes(signature[i])) {
      throw fail("invalid_params", `${type}: якорь ${i + 1} (${anchor.entityId}, point ${anchor.point}) должен быть: ${KIND_NAMES[signature[i]]}.`);
    }
  });
}

function checkValue(type: ConstraintType, value: number | undefined): number | null {
  if (!isDimensionType(type)) {
    if (value !== undefined) throw fail("invalid_params", `${type} — геометрическое ограничение, value не задаётся.`);
    return null;
  }
  if (value === undefined) throw fail("invalid_params", `${type} — размер, задайте value.`);
  const error = dimensionRangeError(type, value);
  if (error) throw fail("invalid_params", error);
  return value;
}

function toRef(anchor: ConstraintAnchorInput, type: ConstraintType, kind: Kind): ConstraintRef {
  const keepsPoint = kind === "point" || type === "angle";
  return { entity_id: anchor.entityId, sub_index: keepsPoint ? anchor.point : 0 };
}

export function buildSketchConstraint(
  input: { type: ConstraintType; anchors: ConstraintAnchorInput[]; value?: number },
  entities: SketchEntity[],
  id: string,
): SketchConstraint {
  checkAnchors(input.type, input.anchors, entities);
  const value = checkValue(input.type, input.value);
  const signature = SIGNATURES[input.type];
  return { id, type: input.type, anchors: input.anchors.map((a, i) => toRef(a, input.type, signature[i])), value };
}

export function updatedConstraintValue(constraints: SketchConstraint[], constraintId: string, value: number): SketchConstraint[] {
  const target = constraints.find((c) => c.id === constraintId);
  if (!target) throw fail("not_found", `В эскизе нет ограничения «${constraintId}».`);
  if (!isDimensionType(target.type)) throw fail("invalid_params", `${target.type} — не размер, у него нет значения.`);
  const error = dimensionRangeError(target.type, value);
  if (error) throw fail("invalid_params", error);
  return constraints.map((c) => (c.id === constraintId ? { ...c, value } : c));
}
