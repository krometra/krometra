export type Dimension = "length" | "angle";

export interface Quantity {
  value: number;
  dimension: Dimension | null;
}

interface Unit {
  dimension: Dimension;
  factor: number;
}

const INCH_MM = 25.4;
const RADIAN_DEG = 180 / Math.PI;

const UNITS: Record<string, Unit> = {
  mm: { dimension: "length", factor: 1 },
  мм: { dimension: "length", factor: 1 },
  cm: { dimension: "length", factor: 10 },
  см: { dimension: "length", factor: 10 },
  m: { dimension: "length", factor: 1000 },
  м: { dimension: "length", factor: 1000 },
  in: { dimension: "length", factor: INCH_MM },
  inch: { dimension: "length", factor: INCH_MM },
  дюйм: { dimension: "length", factor: INCH_MM },
  '"': { dimension: "length", factor: INCH_MM },
  "″": { dimension: "length", factor: INCH_MM },
  deg: { dimension: "angle", factor: 1 },
  "°": { dimension: "angle", factor: 1 },
  град: { dimension: "angle", factor: 1 },
  rad: { dimension: "angle", factor: RADIAN_DEG },
  рад: { dimension: "angle", factor: RADIAN_DEG },
};

export const UNIT_SYMBOLS = ['"', "°", "″"];

export const DIMENSION_WORDS: Record<Dimension, { accusative: string; genitive: string; units: string }> = {
  length: { accusative: "длину", genitive: "длины", units: "mm, cm, m, in" },
  angle: { accusative: "угол", genitive: "угла", units: "deg, rad" },
};

export function findUnit(name: string): Unit | null {
  const key = name.toLowerCase();
  return Object.hasOwn(UNITS, key) ? UNITS[key] : null;
}

export function quantityInUnit(value: number, unitName: string): Quantity {
  const unit = findUnit(unitName.trim());
  if (!unit) return { value, dimension: null };
  return { value: value * unit.factor, dimension: unit.dimension };
}

export function parameterQuantities(parameters: { name: string; value: number; unit: string }[]): Record<string, Quantity> {
  return Object.fromEntries(parameters.map((parameter) => [parameter.name, quantityInUnit(parameter.value, parameter.unit)]));
}
