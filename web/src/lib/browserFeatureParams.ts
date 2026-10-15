import type { TimelineEntry } from "@/types/api";
import { editableBrowserParams, isBrowserFeature } from "./browserRebuildPlan";

export type FeatureParamValue = number | string;

export interface FeatureParamField {
  key: string;
  label: string;
  kind: "number" | "select";
  suffix?: string;
  min?: number;
  max?: number;
  options?: { label: string; value: string }[];
}

const DIRECTION_OPTIONS = {
  one_side: { label: "Одностороннее", value: "one_side" },
  symmetric: { label: "Симметричное", value: "symmetric" },
  two_sided: { label: "В обе стороны", value: "two_sided" },
};

const DEFAULTS: Record<string, FeatureParamValue> = {
  distance: 10,
  direction: "one_side",
  back_distance: 0,
  offset: 0,
  angle: 360,
  radius: 1,
  distance1: 1,
  distance2: 1,
  pitch: 1,
  length: 10,
  thickness: 1,
};

const SHELL_DIRECTION_OPTIONS = [
  { label: "Внутрь", value: "inward" },
  { label: "Наружу", value: "outward" },
];

export function editableValues(entry: TimelineEntry): Record<string, FeatureParamValue> {
  const params = entry.params ?? {};
  return Object.fromEntries(editableBrowserParams(entry.kind).map((key) => {
    const value = params[key];
    return [key, typeof value === "number" || typeof value === "string" ? value : DEFAULTS[key]];
  }));
}

function extrudeFields(entry: TimelineEntry, values: Record<string, FeatureParamValue>): FeatureParamField[] {
  const extent = String(entry.params?.extent_type ?? "distance");
  const upTo = extent === "up_to_face" || extent === "up_to_body";
  const directions = upTo ? [DIRECTION_OPTIONS.one_side, DIRECTION_OPTIONS.two_sided] : Object.values(DIRECTION_OPTIONS);
  const fields: FeatureParamField[] = [];
  if (extent === "distance") fields.push({ key: "distance", label: "Расстояние", kind: "number", suffix: "мм" });
  fields.push({ key: "direction", label: "Направление", kind: "select", options: directions });
  if (values.direction === "two_sided") fields.push({ key: "back_distance", label: "Обратное расстояние", kind: "number", suffix: "мм", min: 0 });
  if (upTo) fields.push({ key: "offset", label: "Смещение", kind: "number", suffix: "мм" });
  return fields;
}

export function featureParamFields(entry: TimelineEntry, values: Record<string, FeatureParamValue>): FeatureParamField[] {
  if (!isBrowserFeature(entry)) return [];
  if (entry.kind === "extrude") return extrudeFields(entry, values);
  if (entry.kind === "revolve") {
    return [
      { key: "angle", label: "Угол", kind: "number", suffix: "°", min: 0.1, max: 360 },
      { key: "direction", label: "Направление", kind: "select", options: [DIRECTION_OPTIONS.one_side, DIRECTION_OPTIONS.symmetric] },
    ];
  }
  if (entry.kind === "fillet") return [{ key: "radius", label: "Радиус", kind: "number", suffix: "мм", min: 0.01 }];
  if (entry.kind === "chamfer") {
    return [
      { key: "distance1", label: "Расстояние 1", kind: "number", suffix: "мм", min: 0.01 },
      { key: "distance2", label: "Расстояние 2", kind: "number", suffix: "мм", min: 0.01 },
    ];
  }
  if (entry.kind === "thread") {
    return [
      { key: "pitch", label: "Шаг", kind: "number", suffix: "мм", min: 0.01 },
      { key: "length", label: "Длина", kind: "number", suffix: "мм", min: 0.01 },
      { key: "offset", label: "Отступ", kind: "number", suffix: "мм", min: 0 },
    ];
  }
  if (entry.kind === "shell") {
    return [
      { key: "thickness", label: "Толщина стенки", kind: "number", suffix: "мм", min: 0.01 },
      { key: "direction", label: "Направление", kind: "select", options: SHELL_DIRECTION_OPTIONS },
    ];
  }
  return [];
}

export function changedParams(
  before: Record<string, FeatureParamValue>,
  after: Record<string, FeatureParamValue>,
): { previous: Record<string, FeatureParamValue>; next: Record<string, FeatureParamValue> } | null {
  const keys = Object.keys(after).filter((key) => after[key] !== before[key]);
  if (keys.length === 0) return null;
  return {
    previous: Object.fromEntries(keys.map((key) => [key, before[key]])),
    next: Object.fromEntries(keys.map((key) => [key, after[key]])),
  };
}

export function isValidParams(values: Record<string, FeatureParamValue>): boolean {
  return Object.entries(values).every(([key, value]) => {
    if (typeof value === "string") return value.length > 0;
    if (!Number.isFinite(value)) return false;
    if (key === "distance") return Math.abs(value) > 1e-9;
    if (key === "angle") return value > 0 && value <= 360;
    if (key === "offset") return true;
    if (key === "back_distance") return value >= 0;
    return value > 0;
  });
}
