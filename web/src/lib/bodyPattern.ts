import type { BodyTransform, Vec3 } from "./bodyTransform";

export type PatternType = "linear" | "circular";
export type PatternMode = "join" | "separate";
export type GlobalAxis = "x" | "y" | "z";

export type PatternAxisRef =
  | { kind: GlobalAxis }
  | { kind: "edge"; bodyId: string; name: string }
  | { kind: "face"; bodyId: string; name: string }
  | { kind: "custom"; origin: Vec3; direction: Vec3 };

export interface PatternLine {
  origin: Vec3;
  direction: Vec3;
}

export interface LinearPatternSpec {
  type: "linear";
  axis: PatternAxisRef;
  count: number;
  spacing: number;
  axis2: PatternAxisRef | null;
  count2: number;
  spacing2: number;
}

export interface CircularPatternSpec {
  type: "circular";
  axis: PatternAxisRef;
  count: number;
  angle: number;
}

export type PatternSpec = LinearPatternSpec | CircularPatternSpec;

export interface PatternLines {
  axis: PatternLine;
  axis2: PatternLine | null;
}

export const MAX_PATTERN_INSTANCES = 100;
export const MAX_SEPARATE_PATTERN_INSTANCES = 25;

const GLOBAL_DIRECTIONS: Record<GlobalAxis, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const FULL_TURN = 360;
const EPSILON = 1e-9;

export function globalAxisLine(axis: GlobalAxis): PatternLine {
  return { origin: [0, 0, 0], direction: GLOBAL_DIRECTIONS[axis] };
}

export function isGlobalAxis(ref: PatternAxisRef): ref is { kind: GlobalAxis } {
  return ref.kind === "x" || ref.kind === "y" || ref.kind === "z";
}

function normalized(vector: Vec3): Vec3 {
  const length = Math.hypot(...vector);
  if (length < EPSILON) throw new Error("Направление массива не задано: ось нулевой длины.");
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function scaled(vector: Vec3, factor: number): Vec3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function added(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function usesSecondDirection(spec: PatternSpec): spec is LinearPatternSpec & { axis2: PatternAxisRef } {
  return spec.type === "linear" && spec.axis2 !== null && spec.count2 > 1;
}

export function patternInstanceCount(spec: PatternSpec): number {
  return usesSecondDirection(spec) ? spec.count * spec.count2 : spec.count;
}

export function patternInstances(spec: PatternSpec, mode: PatternMode): (number | null)[] {
  if (mode === "join") return [null];
  return Array.from({ length: patternInstanceCount(spec) - 1 }, (_, index) => index + 1);
}

export function circularStepAngle(count: number, angle: number): number {
  return angle >= FULL_TURN - EPSILON ? FULL_TURN / count : angle / (count - 1);
}

function linearTransforms(spec: LinearPatternSpec, lines: PatternLines): BodyTransform[] {
  const step = scaled(normalized(lines.axis.direction), spec.spacing);
  const rows = usesSecondDirection(spec) && lines.axis2 ? spec.count2 : 1;
  const step2 = rows > 1 && lines.axis2 ? scaled(normalized(lines.axis2.direction), spec.spacing2) : [0, 0, 0] as Vec3;
  const transforms: BodyTransform[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < spec.count; column++) {
      if (row === 0 && column === 0) continue;
      transforms.push({ translate: added(scaled(step, column), scaled(step2, row)), rotate: null });
    }
  }
  return transforms;
}

function circularTransforms(spec: CircularPatternSpec, line: PatternLine): BodyTransform[] {
  const step = circularStepAngle(spec.count, spec.angle);
  const axis = normalized(line.direction);
  return Array.from({ length: spec.count - 1 }, (_, index) => ({
    translate: [0, 0, 0] as Vec3,
    rotate: { axis, angle: step * (index + 1), origin: line.origin },
  }));
}

export function patternTransforms(spec: PatternSpec, lines: PatternLines): BodyTransform[] {
  return spec.type === "linear" ? linearTransforms(spec, lines) : circularTransforms(spec, lines.axis);
}

export function areParallel(a: Vec3, b: Vec3): boolean {
  const [x, y] = [normalized(a), normalized(b)];
  const cross = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  return Math.hypot(...cross) < 1e-6;
}

function isCount(value: number, minimum: number): boolean {
  return Number.isInteger(value) && value >= minimum;
}

function isNonZero(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) > EPSILON;
}

function axisError(ref: PatternAxisRef | null): string | null {
  if (!ref) return "Укажите направление массива.";
  if (ref.kind === "custom" && ![...ref.origin, ...ref.direction].every(Number.isFinite)) return "Ось массива задана нечисловыми координатами.";
  if (ref.kind === "custom" && Math.hypot(...ref.direction) < EPSILON) return "Ось массива нулевой длины.";
  if ((ref.kind === "edge" || ref.kind === "face") && (!ref.bodyId || !ref.name)) return "Укажите ребро или грань, задающие ось массива.";
  return null;
}

function linearError(spec: LinearPatternSpec): string | null {
  if (!isCount(spec.count, 2)) return "Количество экземпляров — целое число от 2.";
  if (!isNonZero(spec.spacing)) return "Шаг массива не может быть нулевым.";
  if (!isCount(spec.count2, 1)) return "Количество во втором направлении — целое число от 1.";
  if (spec.count2 > 1 && !isNonZero(spec.spacing2)) return "Шаг во втором направлении не может быть нулевым.";
  return spec.count2 > 1 ? axisError(spec.axis2) : null;
}

function circularError(spec: CircularPatternSpec): string | null {
  if (!isCount(spec.count, 2)) return "Количество экземпляров — целое число от 2.";
  if (!Number.isFinite(spec.angle) || spec.angle <= 0 || spec.angle > FULL_TURN) return "Угол кругового массива — от 0 до 360°.";
  return null;
}

export function patternError(spec: PatternSpec, mode: PatternMode): string | null {
  const shapeError = axisError(spec.axis) ?? (spec.type === "linear" ? linearError(spec) : circularError(spec));
  if (shapeError) return shapeError;
  const limit = mode === "separate" ? MAX_SEPARATE_PATTERN_INSTANCES : MAX_PATTERN_INSTANCES;
  const total = patternInstanceCount(spec);
  if (total > limit) {
    return mode === "separate"
      ? `Отдельными телами — не больше ${limit} экземпляров, сейчас ${total}. Объедините их в одно тело или уменьшите количество.`
      : `В массиве не больше ${limit} экземпляров, сейчас ${total}.`;
  }
  return null;
}

export function patternReferenceBodies(spec: PatternSpec): string[] {
  const refs = spec.type === "linear" && spec.count2 > 1 ? [spec.axis, spec.axis2] : [spec.axis];
  return [...new Set(refs.flatMap((ref) => (ref && (ref.kind === "edge" || ref.kind === "face") ? [ref.bodyId] : [])))];
}
