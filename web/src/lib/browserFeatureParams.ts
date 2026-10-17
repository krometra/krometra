import type { TimelineEntry } from "@/types/api";
import { editableBrowserParams, isBrowserFeature } from "./browserRebuildPlan";
import { MIRROR_BASE_PLANES } from "./mirrorPlane";
import { DEFAULT_DRAFT_ANGLE_DEG, draftAngleError } from "./browserDraft";
import { holeParamFields, holeParamsOf } from "./holeFeature";
import { DEFAULT_HOLE_SPEC } from "./holeGeometry";

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
  plane: "XY",
  orientation: "corrected",
  transition: "smooth",
  ...holeParamsOf(DEFAULT_HOLE_SPEC),
  count: 2,
  spacing: 10,
  count2: 1,
  spacing2: 10,
  angle_deg: DEFAULT_DRAFT_ANGLE_DEG,
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

function patternFields(entry: TimelineEntry): FeatureParamField[] {
  const params = entry.params ?? {};
  const countField = (key: string, label: string, min: number): FeatureParamField[] => (
    params.mode === "separate" ? [] : [{ key, label, kind: "number", min }]
  );
  if (params.pattern_type === "circular") {
    return [...countField("count", "Количество", 2), { key: "angle", label: "Угол", kind: "number", suffix: "°", min: 0.1, max: 360 }];
  }
  const fields: FeatureParamField[] = [...countField("count", "Количество", 2), { key: "spacing", label: "Шаг", kind: "number", suffix: "мм" }];
  if (!params.axis2) return fields;
  return [...fields, ...countField("count2", "Количество 2", 1), { key: "spacing2", label: "Шаг 2", kind: "number", suffix: "мм" }];
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
  if (entry.kind === "sweep") {
    return [{ key: "orientation", label: "Ориентация", kind: "select", options: [
      { label: "Без закрутки", value: "corrected" },
      { label: "По Френе", value: "frenet" },
    ] }];
  }
  if (entry.kind === "loft") {
    return [{ key: "transition", label: "Переход", kind: "select", options: [
      { label: "Гладкий", value: "smooth" },
      { label: "Линейный", value: "ruled" },
    ] }];
  }
  if (entry.kind === "fillet") return [{ key: "radius", label: "Радиус", kind: "number", suffix: "мм", min: 0.01 }];
  if (entry.kind === "chamfer") {
    return [
      { key: "distance1", label: "Расстояние 1", kind: "number", suffix: "мм", min: 0.01 },
      { key: "distance2", label: "Расстояние 2", kind: "number", suffix: "мм", min: 0.01 },
    ];
  }
  if (entry.kind === "mirror") {
    if (entry.params?.face_id) return [];
    return [
      { key: "plane", label: "Плоскость", kind: "select", options: MIRROR_BASE_PLANES.map((plane) => ({ label: plane, value: plane })) },
      { key: "offset", label: "Смещение", kind: "number", suffix: "мм" },
    ];
  }
  if (entry.kind === "pattern") return patternFields(entry);
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
  if (entry.kind === "hole") return holeParamFields(values);
  if (entry.kind === "draft") return [{ key: "angle_deg", label: "Угол уклона", kind: "number", suffix: "°", min: 0.01, max: 89.99 }];
  if (entry.kind === "press_pull") return [{ key: "distance", label: "Смещение", kind: "number", suffix: "мм" }];
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
    if (key === "angle_deg") return draftAngleError(value) === null;
    if (key === "offset") return true;
    if (key === "count") return Number.isInteger(value) && value >= 2;
    if (key === "count2") return Number.isInteger(value) && value >= 1;
    if (key === "spacing" || key === "spacing2") return Math.abs(value) > 1e-9;
    if (key === "back_distance") return value >= 0;
    return value > 0;
  });
}
