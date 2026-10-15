import { patternError, type PatternAxisRef, type PatternMode, type PatternSpec, type PatternType } from "./bodyPattern";

export type PatternAxisSlot = "axis" | "axis2";
export type PatternPickKind = "edge" | "face";

export interface PatternForm {
  type: PatternType;
  axis: PatternAxisRef | null;
  count: number;
  spacing: number;
  angle: number;
  secondDirection: boolean;
  axis2: PatternAxisRef | null;
  count2: number;
  spacing2: number;
}

export function defaultPatternForm(): PatternForm {
  return { type: "linear", axis: { kind: "x" }, count: 3, spacing: 20, angle: 360, secondDirection: false, axis2: { kind: "y" }, count2: 2, spacing2: 20 };
}

export function patternSpecOf(form: PatternForm): PatternSpec | null {
  if (!form.axis) return null;
  if (form.type === "circular") return { type: "circular", axis: form.axis, count: form.count, angle: form.angle };
  const second = form.secondDirection && form.axis2 !== null;
  return {
    type: "linear",
    axis: form.axis,
    count: form.count,
    spacing: form.spacing,
    axis2: second ? form.axis2 : null,
    count2: second ? form.count2 : 1,
    spacing2: form.spacing2,
  };
}

export function patternFormError(sourceBodyId: string | null, form: PatternForm, mode: PatternMode): string | null {
  if (!sourceBodyId) return "Выберите тело, которое нужно размножить.";
  const spec = patternSpecOf(form);
  if (!spec) return form.type === "circular" ? "Укажите ось вращения массива." : "Укажите направление массива.";
  if (form.type === "linear" && form.secondDirection && !form.axis2) return "Укажите второе направление массива.";
  return patternError(spec, mode);
}

export function pickHint(kind: PatternPickKind, slot: PatternAxisSlot, type: PatternType): string {
  if (kind === "edge") return "Кликните прямое ребро — по нему пойдёт массив";
  if (type === "circular" && slot === "axis") return "Кликните цилиндрическую грань — массив повернётся вокруг её оси";
  return "Кликните цилиндрическую грань (её ось) или плоскую грань (её нормаль)";
}
