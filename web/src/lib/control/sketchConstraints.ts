import type { ConstraintRef, ConstraintType, SketchConstraint, SketchEntity } from "@/types/api";
import { dimensionRangeError, isDimensionType } from "@/sketcher/dimensionKinds";
import { SKETCH_AXIS_IDS, SKETCH_ORIGIN_ID, sketchAxisOf } from "@/sketcher/sketchOrigin";
import { LINE_MIDPOINT } from "@/sketcher/sketchPoints";
import { WHOLE_ENTITY } from "@/sketcher/solver/fixConstraint";
import { INVALID, isPlainObject, type ParamSpec } from "./params";
import { fail } from "./protocol";

type Kind = "line" | "round" | "curve" | "point" | "any" | "fixable";

const SIGNATURES: Record<ConstraintType, Kind[]> = {
  horizontal: ["line"],
  vertical: ["line"],
  coincident: ["point", "point"],
  parallel: ["line", "line"],
  perpendicular: ["line", "line"],
  equal: ["any", "any"],
  collinear: ["line", "line"],
  midpoint: ["point", "line"],
  point_on_curve: ["point", "curve"],
  fix: ["fixable"],
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

const POINT_PAIR: Kind[] = ["point", "point"];

const ALTERNATE_SIGNATURES: Partial<Record<ConstraintType, Kind[][]>> = {
  horizontal: [POINT_PAIR],
  vertical: [POINT_PAIR],
};

export const CONSTRAINT_TYPE_NAMES = Object.keys(SIGNATURES) as ConstraintType[];

function signatureFor(type: ConstraintType, count: number): Kind[] {
  return [SIGNATURES[type], ...(ALTERNATE_SIGNATURES[type] ?? [])].find((s) => s.length === count) ?? SIGNATURES[type];
}

export const SKETCH_CONSTRAINT_HELP =
  "Ограничение эскиза. Геометрические (без value): horizontal, vertical [отрезок] или [точка, точка]; parallel, perpendicular [отрезок, отрезок]; " +
  "coincident [точка, точка]; equal [два отрезка или две окружности/дуги]; collinear [отрезок, отрезок] — на одной прямой; " +
  "midpoint [точка, отрезок] — точка в середине отрезка; point_on_curve [точка, кривая] — точка на отрезке или его продолжении, на прямой или оси, на окружности или дуге; " +
  "fix [объект или точка] — без point закрепляет объект целиком, с point — только эту точку. Размерные (value обязателен, мм или градусы): " +
  "length [отрезок] — длина; line_distance [отрезок, отрезок] — расстояние между параллельными; " +
  "point_line_distance [точка, отрезок] — перпендикулярное расстояние; distance [точка, точка] — наклонное; " +
  "horizontal_distance и vertical_distance [точка, точка] — по X и по Y, сторона сохраняется по текущему положению; " +
  "radius и diameter [окружность или дуга]; angle [отрезок, отрезок] — угол в градусах от первого луча ко второму против часовой. " +
  `Якорь — { entityId, point? }. point у отрезка: 0 — начало, 1 — конец, ${LINE_MIDPOINT} — середина (у angle 1 — луч от конца к началу); у окружности и дуги 0 — центр, у дуги 1 и 2 — концы. ` +
  `Начало координат эскиза — entityId "${SKETCH_ORIGIN_ID}" (или "origin"), оси — "${SKETCH_AXIS_IDS.x}" и "${SKETCH_AXIS_IDS.y}" (или "axis-x", "axis-y"): ` +
  "они, вспомогательные прямые (infline) и вспомогательные отрезки, в том числе рёбра грани face-edge-*, работают как отрезки; начало координат, оси и рёбра грани неподвижны.";

const ANCHOR_ALIASES: Record<string, string> = {
  origin: SKETCH_ORIGIN_ID,
  "axis-x": SKETCH_AXIS_IDS.x,
  "axis-y": SKETCH_AXIS_IDS.y,
};

export function canonicalAnchorId(entityId: string): string {
  return ANCHOR_ALIASES[entityId] ?? entityId;
}

export interface ConstraintAnchorInput {
  entityId: string;
  point: number;
  whole?: boolean;
}

function readAnchor(value: unknown): ConstraintAnchorInput | typeof INVALID {
  if (!isPlainObject(value)) return INVALID;
  const entityId = typeof value.entityId === "number" ? String(value.entityId) : value.entityId;
  const point = value.point ?? 0;
  if (typeof entityId !== "string" || entityId.length === 0) return INVALID;
  if (typeof point !== "number" || !Number.isInteger(point) || point < 0 || point > 3) return INVALID;
  const anchor = { entityId: canonicalAnchorId(entityId), point };
  return value.point === undefined ? { ...anchor, whole: true } : anchor;
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
  if (anchor.entityId === SKETCH_ORIGIN_ID) return anchor.point === 0 ? ["point", "any", "fixable"] : [];
  if (sketchAxisOf(anchor.entityId)) return anchor.point <= 1 ? ["line", "curve"] : [];
  if (!entity) return [];
  if (entity.type === "infline") return anchor.point <= 1 ? ["line", "curve"] : [];
  if (entity.type === "line" && anchor.point === LINE_MIDPOINT) return ["point"];
  if (entity.type === "line") return anchor.point <= 1 ? ["line", "curve", "point", "any", "fixable"] : [];
  if (entity.type === "circle") return anchor.point <= 1 ? ["round", "curve", "point", "any", "fixable"] : [];
  if (entity.type === "arc") return anchor.point <= 2 ? ["round", "curve", "point", "any", "fixable"] : [];
  return [];
}

const KIND_NAMES: Record<Kind, string> = {
  line: "отрезок",
  round: "окружность или дуга",
  curve: "отрезок, окружность или дуга",
  fixable: "объект или точка",
  point: "точка",
  any: "объект",
};

function isKnownAnchor(entity: SketchEntity | undefined, anchor: ConstraintAnchorInput): boolean {
  return entity !== undefined || anchor.entityId === SKETCH_ORIGIN_ID || sketchAxisOf(anchor.entityId) !== null;
}

function checkAnchors(type: ConstraintType, anchors: ConstraintAnchorInput[], entities: SketchEntity[]) {
  const signature = signatureFor(type, anchors.length);
  if (anchors.length !== signature.length) {
    throw fail("invalid_params", `${type}: нужно якорей ${signature.length}, передано ${anchors.length}.`);
  }
  anchors.forEach((anchor, i) => {
    const entity = entities.find((e) => e.id === anchor.entityId);
    if (!isKnownAnchor(entity, anchor)) throw fail("not_found", `В эскизе нет сущности «${anchor.entityId}».`);
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
  if (kind === "fixable") {
    const whole = anchor.whole === true && anchor.entityId !== SKETCH_ORIGIN_ID;
    return { entity_id: anchor.entityId, sub_index: whole ? WHOLE_ENTITY : anchor.point };
  }
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
  const signature = signatureFor(input.type, input.anchors.length);
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
