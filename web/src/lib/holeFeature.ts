import {
  DEFAULT_HOLE_SPEC,
  HOLE_BOTTOMS,
  HOLE_EXTENTS,
  HOLE_TYPES,
  type HoleBottom,
  type HoleExtent,
  type HoleSketchPlacement,
  type HoleSpec,
  type HoleType,
} from "./holeGeometry";
import type { Vec3 } from "./threadGeometry";
import type { PlaneBasis, SketchEntity, SketchPlane } from "@/types/api";
import type { FeatureParamField, FeatureParamValue } from "./browserFeatureParams";

export interface HoleTarget {
  bodyId: string;
  faceId: string | number;
  facePoints: Vec3[];
  centers: Vec3[];
  sketch: (HoleSketchPlacement & { sketchId: string }) | null;
}

export const HOLE_EDITABLE_PARAMS = [
  "hole_type",
  "diameter",
  "extent",
  "depth",
  "bottom",
  "cbore_diameter",
  "cbore_depth",
  "csink_diameter",
  "csink_angle",
] as const;

export const HOLE_TYPE_LABELS: Record<HoleType, string> = {
  simple: "Простое",
  counterbore: "Цековка",
  countersink: "Зенковка",
};

export const HOLE_EXTENT_LABELS: Record<HoleExtent, string> = {
  distance: "На глубину",
  through_all: "Насквозь",
};

export const HOLE_BOTTOM_LABELS: Record<HoleBottom, string> = {
  flat: "Плоское",
  cone: "Конус 118°",
};

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function choice<T extends string>(value: unknown, options: T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export function holeSpecFromParams(params: Record<string, unknown>): HoleSpec {
  const base = DEFAULT_HOLE_SPEC;
  return {
    type: choice(params.hole_type, HOLE_TYPES, base.type),
    diameter: numberOr(params.diameter, base.diameter),
    extent: choice(params.extent, HOLE_EXTENTS, base.extent),
    depth: numberOr(params.depth, base.depth),
    bottom: choice(params.bottom, HOLE_BOTTOMS, base.bottom),
    cboreDiameter: numberOr(params.cbore_diameter, base.cboreDiameter),
    cboreDepth: numberOr(params.cbore_depth, base.cboreDepth),
    csinkDiameter: numberOr(params.csink_diameter, base.csinkDiameter),
    csinkAngle: numberOr(params.csink_angle, base.csinkAngle),
  };
}

export function holeParamsOf(spec: HoleSpec): Record<(typeof HOLE_EDITABLE_PARAMS)[number], string | number> {
  return {
    hole_type: spec.type,
    diameter: spec.diameter,
    extent: spec.extent,
    depth: spec.depth,
    bottom: spec.bottom,
    cbore_diameter: spec.cboreDiameter,
    cbore_depth: spec.cboreDepth,
    csink_diameter: spec.csinkDiameter,
    csink_angle: spec.csinkAngle,
  };
}

function millimetres(value: number): string {
  return `${Number(value.toFixed(3))}`;
}

function sizeLabel(spec: HoleSpec): string {
  const depth = spec.extent === "through_all" ? "насквозь" : `${millimetres(spec.depth)} мм`;
  if (spec.type === "counterbore") return `⌀${millimetres(spec.diameter)}/⌀${millimetres(spec.cboreDiameter)} · ${depth}`;
  if (spec.type === "countersink") return `⌀${millimetres(spec.diameter)}/⌀${millimetres(spec.csinkDiameter)}×${millimetres(spec.csinkAngle)}° · ${depth}`;
  return `⌀${millimetres(spec.diameter)} · ${depth}`;
}

export function holeLabel(spec: HoleSpec, count: number): string {
  const kind = spec.type === "simple" ? "Отверстие" : `Отверстие с ${spec.type === "counterbore" ? "цековкой" : "зенковкой"}`;
  return `${kind} ${sizeLabel(spec)}${count > 1 ? ` · ${count} шт.` : ""}`;
}

export function holeCount(params: Record<string, unknown>): number {
  return Array.isArray(params.centers) ? params.centers.length : 0;
}

export function holeDetail(params: Record<string, unknown>): string {
  const count = holeCount(params);
  return `${sizeLabel(holeSpecFromParams(params))}${count > 1 ? ` · ${count} шт.` : ""}`;
}

export function holeSummaryRows(params: Record<string, unknown>): { label: string; value: string }[] {
  const spec = holeSpecFromParams(params);
  const rows = [
    { label: "Тип", value: HOLE_TYPE_LABELS[spec.type] },
    { label: "Диаметр", value: `${millimetres(spec.diameter)} мм` },
    { label: "Глубина", value: spec.extent === "through_all" ? HOLE_EXTENT_LABELS.through_all : `${millimetres(spec.depth)} мм` },
  ];
  if (spec.extent === "distance") rows.push({ label: "Дно", value: HOLE_BOTTOM_LABELS[spec.bottom] });
  if (spec.type === "counterbore") {
    rows.push({ label: "Цековка", value: `⌀${millimetres(spec.cboreDiameter)} × ${millimetres(spec.cboreDepth)} мм` });
  }
  if (spec.type === "countersink") {
    rows.push({ label: "Зенковка", value: `⌀${millimetres(spec.csinkDiameter)} × ${millimetres(spec.csinkAngle)}°` });
  }
  rows.push({ label: "Отверстий", value: String(holeCount(params)) });
  return rows;
}

function options<T extends string>(labels: Record<T, string>): { label: string; value: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ label: labels[value], value }));
}

export function holeParamFields(values: Record<string, FeatureParamValue>): FeatureParamField[] {
  const sizeField = (key: string, label: string): FeatureParamField => ({ key, label, kind: "number", suffix: "мм", min: 0.01 });
  const fields: FeatureParamField[] = [
    { key: "hole_type", label: "Тип", kind: "select", options: options(HOLE_TYPE_LABELS) },
    sizeField("diameter", "Диаметр"),
    { key: "extent", label: "Предел", kind: "select", options: options(HOLE_EXTENT_LABELS) },
  ];
  if (values.extent !== "through_all") {
    fields.push(sizeField("depth", "Глубина"), { key: "bottom", label: "Дно", kind: "select", options: options(HOLE_BOTTOM_LABELS) });
  }
  if (values.hole_type === "counterbore") fields.push(sizeField("cbore_diameter", "Диаметр цековки"), sizeField("cbore_depth", "Глубина цековки"));
  if (values.hole_type === "countersink") {
    fields.push(sizeField("csink_diameter", "Диаметр зенковки"), { key: "csink_angle", label: "Угол зенковки", kind: "number", suffix: "°", min: 1, max: 179 });
  }
  return fields;
}

export function holeSketchPlacement(sketch: Record<string, unknown>): HoleSketchPlacement | null {
  const entities = Array.isArray(sketch.entities) ? (sketch.entities as SketchEntity[]) : [];
  if (!entities.some((entity) => entity?.type === "circle")) return null;
  return {
    entities,
    plane: (["XY", "XZ", "YZ"].includes(String(sketch.plane)) ? sketch.plane : "XY") as SketchPlane,
    planeOffset: numberOr(sketch.plane_offset, 0),
    planeBasis: (sketch.plane_basis as PlaneBasis | null | undefined) ?? null,
  };
}

export function holeWorkerRequest(target: HoleTarget, spec: HoleSpec, featureKey: string) {
  const sketch = target.sketch;
  return {
    kind: "hole" as const,
    bodyId: target.bodyId,
    faceId: target.faceId,
    facePoints: target.facePoints,
    centers: target.centers,
    entities: sketch?.entities ?? null,
    plane: sketch?.plane ?? "XY",
    planeOffset: sketch?.planeOffset ?? 0,
    planeBasis: sketch?.planeBasis ?? null,
    spec,
    featureKey,
  };
}
