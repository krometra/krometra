import type { ConstraintType } from "@/types/api";
import type { Dimension } from "@/lib/units";

export const DIMENSION_TYPES = [
  "distance",
  "horizontal_distance",
  "vertical_distance",
  "length",
  "line_distance",
  "point_line_distance",
  "radius",
  "diameter",
  "angle",
] as const satisfies readonly ConstraintType[];

export type DimensionType = (typeof DIMENSION_TYPES)[number];

const TITLES: Record<DimensionType, string> = {
  distance: "Расстояние",
  horizontal_distance: "Расстояние по горизонтали",
  vertical_distance: "Расстояние по вертикали",
  length: "Длина",
  line_distance: "Расстояние между отрезками",
  point_line_distance: "Расстояние от точки до линии",
  radius: "Радиус",
  diameter: "Диаметр",
  angle: "Угол",
};

const STRICTLY_POSITIVE = new Set<DimensionType>(["length", "radius", "diameter"]);

export function isDimensionType(type: ConstraintType): type is DimensionType {
  return (DIMENSION_TYPES as readonly ConstraintType[]).includes(type);
}

export function dimensionTitle(type: DimensionType): string {
  return TITLES[type];
}

export function dimensionQuantity(type: DimensionType): Dimension {
  return type === "angle" ? "angle" : "length";
}

export function dimensionRangeError(type: DimensionType, value: number): string | null {
  if (type === "angle") return Math.abs(value) < 360 ? null : "Угол должен быть меньше 360°";
  if (STRICTLY_POSITIVE.has(type)) return value > 0 ? null : `${TITLES[type]}: значение должно быть больше нуля`;
  return value >= 0 ? null : "Расстояние не может быть отрицательным";
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function dimensionText(type: DimensionType, value: number | null): string {
  if (value === null) return "?";
  if (type === "angle") return `${formatNumber(value)}°`;
  if (type === "radius") return `R${formatNumber(value)}`;
  if (type === "diameter") return `⌀${formatNumber(value)}`;
  return formatNumber(value);
}
