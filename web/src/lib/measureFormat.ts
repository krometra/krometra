import type { MeasuredBody, MeasuredEdge, MeasuredFace, MeasuredItem, MeasuredPair, MeasureRef, MeasureResult, SurfaceKind } from "./measure";
import type { Vec3 } from "./threadGeometry";

export interface Material {
  id: string;
  label: string;
  density: number;
}

export const MATERIALS: Material[] = [
  { id: "steel", label: "Сталь", density: 7.85 },
  { id: "stainless", label: "Нержавеющая сталь", density: 7.93 },
  { id: "aluminium", label: "Алюминий", density: 2.7 },
  { id: "brass", label: "Латунь", density: 8.5 },
  { id: "copper", label: "Медь", density: 8.96 },
  { id: "titanium", label: "Титан", density: 4.43 },
  { id: "pla", label: "PLA", density: 1.24 },
  { id: "petg", label: "PETG", density: 1.27 },
  { id: "abs", label: "ABS", density: 1.04 },
  { id: "nylon", label: "Нейлон PA12", density: 1.01 },
];

export const DEFAULT_MATERIAL = MATERIALS[0];
export const CUSTOM_MATERIAL_ID = "custom";

export interface MeasureRow {
  id: string;
  label: string;
  value: string;
  copy: string;
}

export interface MeasureGroup {
  id: string;
  title: string;
  rows: MeasureRow[];
}

const SURFACE_TITLES: Record<SurfaceKind, string> = {
  plane: "Грань — плоская",
  cylinder: "Грань — цилиндрическая",
  cone: "Грань — коническая",
  sphere: "Грань — сферическая",
  torus: "Грань — тороидальная",
  other: "Грань — поверхность",
};

const PICK_TITLES: Record<MeasureRef["kind"], string> = {
  vertex: "Вершина",
  edge: "Ребро",
  face: "Грань",
  body: "Тело",
};

export function pickTitle(pick: MeasureRef): string {
  return PICK_TITLES[pick.kind];
}

export function massGrams(volumeMm3: number, densityGcm3: number): number {
  return (volumeMm3 / 1000) * densityGcm3;
}

export function densityOf(materialId: string): number | null {
  return MATERIALS.find((material) => material.id === materialId)?.density ?? null;
}

export function materialForDensity(materialId: string, density: number): string {
  return densityOf(materialId) === density ? materialId : CUSTOM_MATERIAL_ID;
}

export function fixed(value: number, digits = 3): string {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}

function triple(point: Vec3, digits = 3): string {
  return point.map((value) => fixed(value, digits)).join(", ");
}

function row(id: string, label: string, copy: string, unit: string): MeasureRow {
  return { id, label, value: unit ? `${copy} ${unit}` : copy, copy };
}

function massRow(id: string, grams: number): MeasureRow {
  return grams >= 1000 ? row(id, "Масса", fixed(grams / 1000), "кг") : row(id, "Масса", fixed(grams, 2), "г");
}

export function itemTitle(item: MeasuredItem): string {
  if (item.kind === "vertex") return "Вершина";
  if (item.kind === "body") return "Тело";
  if (item.kind === "face") return SURFACE_TITLES[item.surface];
  if (item.curve === "line") return "Ребро — отрезок";
  if (item.curve === "circle") return item.closed ? "Ребро — окружность" : "Ребро — дуга";
  return "Ребро — кривая";
}

function radiusRows(prefix: string, radius: number | null): MeasureRow[] {
  if (radius === null) return [];
  return [row(`${prefix}-radius`, "Радиус", fixed(radius), "мм"), row(`${prefix}-diameter`, "Диаметр", fixed(radius * 2), "мм")];
}

function edgeRows(prefix: string, edge: MeasuredEdge): MeasureRow[] {
  const rows = [row(`${prefix}-length`, "Длина", fixed(edge.length), "мм"), ...radiusRows(prefix, edge.radius)];
  if (edge.center) rows.push(row(`${prefix}-center`, "Центр", triple(edge.center), "мм"));
  if (edge.radius && !edge.closed) rows.push(row(`${prefix}-sweep`, "Угол дуги", fixed((edge.length / edge.radius) * (180 / Math.PI), 2), "°"));
  return rows;
}

function faceRows(prefix: string, face: MeasuredFace): MeasureRow[] {
  const rows = [row(`${prefix}-area`, "Площадь", fixed(face.area), "мм²"), ...radiusRows(prefix, face.radius)];
  if (face.normal) rows.push(row(`${prefix}-normal`, "Нормаль", triple(face.normal, 4), ""));
  return rows;
}

function bodyRows(prefix: string, body: MeasuredBody, density: number): MeasureRow[] {
  const size: Vec3 = [0, 1, 2].map((axis) => body.bbox.max[axis] - body.bbox.min[axis]) as Vec3;
  return [
    row(`${prefix}-volume`, "Объём", fixed(body.volume), "мм³"),
    row(`${prefix}-area`, "Площадь поверхности", fixed(body.area), "мм²"),
    row(`${prefix}-center`, "Центр масс", triple(body.centerOfMass), "мм"),
    row(`${prefix}-size`, "Габарит", size.map((value) => fixed(value)).join(" × "), "мм"),
    massRow(`${prefix}-mass`, massGrams(body.volume, density)),
  ];
}

function itemRows(prefix: string, item: MeasuredItem, density: number): MeasureRow[] {
  if (item.kind === "vertex") return [row(`${prefix}-point`, "Координаты", triple(item.point), "мм")];
  if (item.kind === "edge") return edgeRows(prefix, item);
  if (item.kind === "face") return faceRows(prefix, item);
  return bodyRows(prefix, item, density);
}

function pairRows(pair: MeasuredPair): MeasureRow[] {
  const rows = [
    row("pair-distance", "Расстояние", fixed(pair.distance), "мм"),
    row("pair-delta", "ΔX, ΔY, ΔZ", triple(pair.delta), "мм"),
  ];
  if (pair.angle !== null) rows.push(row("pair-angle", "Угол", fixed(pair.angle, 2), "°"));
  if (pair.axisDistance !== null) rows.push(row("pair-axes", "Между осями", fixed(pair.axisDistance), "мм"));
  if (pair.centerDistance !== null) rows.push(row("pair-centers", "Между центрами", fixed(pair.centerDistance), "мм"));
  return rows;
}

export function measureGroups(result: MeasureResult, titles: string[], density: number): MeasureGroup[] {
  const groups = result.items.map((item, index) => ({
    id: `item-${index + 1}`,
    title: titles[index] ?? itemTitle(item),
    rows: itemRows(`item-${index + 1}`, item, density),
  }));
  return result.pair ? [{ id: "pair", title: "Между объектами", rows: pairRows(result.pair) }, ...groups] : groups;
}
