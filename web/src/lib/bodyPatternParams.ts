import type { Vec3 } from "./bodyTransform";
import { isGlobalAxis, type PatternAxisRef, type PatternMode, type PatternSpec } from "./bodyPattern";

type Params = Record<string, unknown>;

const AXIS_LABELS: Record<string, string> = { x: "ось X", y: "ось Y", z: "ось Z" };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function vector(value: unknown): Vec3 {
  return Array.isArray(value) && value.length === 3 ? [number(value[0], 0), number(value[1], 0), number(value[2], 0)] : [0, 0, 0];
}

export function axisRefParams(ref: PatternAxisRef): Params {
  if (isGlobalAxis(ref)) return { kind: ref.kind };
  if (ref.kind === "custom") return { kind: "custom", origin: [...ref.origin], direction: [...ref.direction] };
  return { kind: ref.kind, body_id: ref.bodyId, name: ref.name };
}

export function axisRefFromParams(value: unknown): PatternAxisRef | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Params;
  const kind = text(raw.kind);
  if (kind === "x" || kind === "y" || kind === "z") return { kind };
  if (kind === "custom") return { kind, origin: vector(raw.origin), direction: vector(raw.direction) };
  if (kind === "edge" || kind === "face") return { kind, bodyId: text(raw.body_id), name: text(raw.name) };
  return null;
}

export function patternTimelineParams(spec: PatternSpec, mode: PatternMode): Params {
  const common = { pattern_type: spec.type, mode, axis: axisRefParams(spec.axis), count: spec.count };
  if (spec.type === "circular") return { ...common, angle: spec.angle };
  return {
    ...common,
    spacing: spec.spacing,
    axis2: spec.axis2 ? axisRefParams(spec.axis2) : null,
    count2: spec.count2,
    spacing2: spec.spacing2,
  };
}

export function patternModeOf(params: Params): PatternMode {
  return params.mode === "separate" ? "separate" : "join";
}

export function patternSpecFromParams(params: Params): PatternSpec {
  const axis = axisRefFromParams(params.axis) ?? { kind: "x" };
  const count = number(params.count, 2);
  if (params.pattern_type === "circular") return { type: "circular", axis, count, angle: number(params.angle, 360) };
  return {
    type: "linear",
    axis,
    count,
    spacing: number(params.spacing, 10),
    axis2: axisRefFromParams(params.axis2),
    count2: number(params.count2, 1),
    spacing2: number(params.spacing2, 10),
  };
}

export function axisRefLabel(ref: PatternAxisRef | null, bodyLabel: (bodyId: string) => string): string {
  if (!ref) return "—";
  if (isGlobalAxis(ref)) return AXIS_LABELS[ref.kind];
  if (ref.kind === "custom") return `через [${ref.origin.join(", ")}] вдоль [${ref.direction.join(", ")}]`;
  return `${ref.kind === "edge" ? "ребро" : "грань"} ${bodyLabel(ref.bodyId)}`;
}

export function patternSummary(spec: PatternSpec): string {
  if (spec.type === "circular") return `${spec.count} шт. · ${spec.angle}°`;
  const grid = spec.axis2 && spec.count2 > 1 ? `${spec.count}×${spec.count2}` : `${spec.count}`;
  return `${grid} шт. · шаг ${spec.spacing} мм`;
}

export function patternLabel(spec: PatternSpec, mode: PatternMode): string {
  const kind = spec.type === "circular" ? "Круговой массив" : "Линейный массив";
  return `${kind}: ${patternSummary(spec)}${mode === "separate" ? ", отдельные тела" : ""}`;
}

export function patternParamRows(params: Params, bodyLabel: (bodyId: string) => string): { label: string; value: string }[] {
  const spec = patternSpecFromParams(params);
  const rows = [
    { label: "Тип", value: spec.type === "circular" ? "Круговой" : "Линейный" },
    { label: "Результат", value: patternModeOf(params) === "separate" ? "Отдельные тела" : "Объединить с исходным" },
    { label: spec.type === "circular" ? "Ось" : "Направление", value: axisRefLabel(spec.axis, bodyLabel) },
    { label: "Количество", value: String(spec.count) },
  ];
  if (spec.type === "circular") return [...rows, { label: "Угол", value: `${spec.angle}°` }];
  rows.push({ label: "Шаг", value: `${spec.spacing} мм` });
  if (!spec.axis2 || spec.count2 <= 1) return rows;
  return [
    ...rows,
    { label: "Направление 2", value: axisRefLabel(spec.axis2, bodyLabel) },
    { label: "Количество 2", value: String(spec.count2) },
    { label: "Шаг 2", value: `${spec.spacing2} мм` },
  ];
}
