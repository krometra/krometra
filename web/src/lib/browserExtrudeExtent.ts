import type { BrowserExtrudeOperation } from "./browserBoolean";
import type { Vector3 } from "./browserExtrudeFrame";

export type BrowserExtentType = "distance" | "through_all" | "up_to_face" | "up_to_body";
export type BrowserExtrudeDirection = "one_side" | "symmetric" | "two_sided";

export interface BrowserExtrudeSpan {
  start: number;
  end: number;
}

export interface BrowserExtrudeExtent {
  extentType: BrowserExtentType;
  direction: BrowserExtrudeDirection;
  distance: number;
  backDistance: number;
  offset: number;
  operation: BrowserExtrudeOperation;
}

const EPS = 1e-9;
const THROUGH_ALL_MARGIN = 1;
const CUT_FACE_EXTEND = 0.1;

export function projectOntoNormal(points: Vector3[], origin: Vector3, n: Vector3): number[] {
  return points.map((p) => (p[0] - origin[0]) * n[0] + (p[1] - origin[1]) * n[1] + (p[2] - origin[2]) * n[2]);
}

export function boxCorners(min: Vector3, max: Vector3): Vector3[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
    i & 1 ? max[0] : min[0],
    i & 2 ? max[1] : min[1],
    i & 4 ? max[2] : min[2],
  ]);
}

export function flatPoints(values: number[]): Vector3[] {
  const points: Vector3[] = [];
  for (let i = 0; i + 2 < values.length; i += 3) points.push([values[i], values[i + 1], values[i + 2]]);
  return points;
}

function sideSpan(sign: number, length: number, direction: BrowserExtrudeDirection, back: number): BrowserExtrudeSpan {
  if (direction === "symmetric") return { start: -length / 2, end: length / 2 };
  const backLength = direction === "two_sided" ? back : 0;
  return sign > 0 ? { start: 0 - backLength, end: length } : { start: -length, end: backLength };
}

function assertBackDistance(direction: BrowserExtrudeDirection, back: number) {
  if (direction !== "two_sided") return;
  if (!(back > EPS) || !Number.isFinite(back)) {
    throw new Error("Для выдавливания в обе стороны задайте обратное расстояние больше нуля.");
  }
}

function assertNotSymmetric(direction: BrowserExtrudeDirection) {
  if (direction === "symmetric") {
    throw new Error("Симметричное выдавливание доступно только на расстояние или насквозь.");
  }
}

function distanceSpan(extent: BrowserExtrudeExtent): BrowserExtrudeSpan {
  const length = Math.abs(extent.distance);
  if (!(length > EPS)) throw new Error("Расстояние выдавливания не может быть нулевым.");
  return sideSpan(Math.sign(extent.distance), length, extent.direction, extent.backDistance);
}

function throughAllSpan(extent: BrowserExtrudeExtent, projections: number[]): BrowserExtrudeSpan {
  if (extent.operation === "new_body") {
    throw new Error("Выдавливание насквозь доступно только для приклеивания и выреза.");
  }
  const ahead = Math.max(0, ...projections);
  const behind = Math.max(0, ...projections.map((value) => -value));
  if (extent.direction === "symmetric" || extent.direction === "two_sided") {
    const reach = extent.direction === "symmetric" ? Math.max(ahead, behind) : 0;
    return {
      start: -Math.max(behind, reach) - THROUGH_ALL_MARGIN,
      end: Math.max(ahead, reach) + THROUGH_ALL_MARGIN,
    };
  }
  const sign = Math.sign(extent.distance) || 1;
  const reach = sign > 0 ? ahead : behind;
  if (!(reach > EPS)) {
    throw new Error("Тело не лежит по направлению выдавливания — переключите «Реверс».");
  }
  return sideSpan(sign, reach + THROUGH_ALL_MARGIN, "one_side", 0);
}

function offsetLength(length: number, offset: number): number {
  const result = length + offset;
  if (!(result > EPS)) throw new Error("Смещение не оставляет длины выдавливания — уменьшите его.");
  return result;
}

function upToFaceSpan(extent: BrowserExtrudeExtent, projections: number[]): BrowserExtrudeSpan {
  assertNotSymmetric(extent.direction);
  if (projections.length === 0) throw new Error("Целевая грань не содержит вершин — выдавливание «до грани» невозможно.");
  const far = projections.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
  if (Math.abs(far) < EPS * 1e3) {
    throw new Error("Целевая грань лежит в плоскости эскиза — выдавливать до неё некуда. Выберите другую грань.");
  }
  const extend = extent.operation === "cut" ? CUT_FACE_EXTEND : 0;
  const length = offsetLength(Math.abs(far) + extend, extent.offset);
  return sideSpan(Math.sign(far), length, extent.direction, extent.backDistance);
}

function upToBodySpan(extent: BrowserExtrudeExtent, projections: number[]): BrowserExtrudeSpan {
  assertNotSymmetric(extent.direction);
  if (projections.length === 0) throw new Error("Целевое тело пустое — выдавливание «до тела» невозможно.");
  const sign = Math.sign(extent.distance) || 1;
  const along = projections.map((value) => value * sign);
  if (!(Math.max(...along) > EPS)) {
    throw new Error("Тело не лежит по направлению выдавливания — переключите «Реверс».");
  }
  const near = Math.min(...along);
  if (near < 1e-6) {
    throw new Error("Тело касается или пересекает плоскость эскиза — выберите грань вместо тела.");
  }
  return sideSpan(sign, offsetLength(near, extent.offset), extent.direction, extent.backDistance);
}

export function browserExtrudeSpan(extent: BrowserExtrudeExtent, projections: number[] | null): BrowserExtrudeSpan {
  assertBackDistance(extent.direction, extent.backDistance);
  if (extent.extentType === "distance") return distanceSpan(extent);
  if (!projections) throw new Error("Не задана цель выдавливания.");
  if (extent.extentType === "through_all") return throughAllSpan(extent, projections);
  if (extent.extentType === "up_to_face") return upToFaceSpan(extent, projections);
  return upToBodySpan(extent, projections);
}
