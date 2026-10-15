import type { Vec3 } from "./threadGeometry";
import { cross, dot, magnitude, subtract, unit } from "./vec3";

export type MeasureRef =
  | { kind: "vertex"; bodyId: string; point: Vec3 }
  | { kind: "edge"; bodyId: string; edgeId: string }
  | { kind: "face"; bodyId: string; faceId: string }
  | { kind: "body"; bodyId: string };

export type MeasureFilter = "entity" | "body";

export interface MeasureAxis {
  origin: Vec3;
  direction: Vec3;
}

export interface MeasuredVertex {
  kind: "vertex";
  point: Vec3;
}

export interface MeasuredEdge {
  kind: "edge";
  curve: "line" | "circle" | "other";
  length: number;
  start: Vec3;
  end: Vec3;
  closed: boolean;
  direction: Vec3 | null;
  radius: number | null;
  center: Vec3 | null;
  axis: MeasureAxis | null;
}

export type SurfaceKind = "plane" | "cylinder" | "cone" | "sphere" | "torus" | "other";

export interface MeasuredFace {
  kind: "face";
  surface: SurfaceKind;
  area: number;
  centroid: Vec3;
  normal: Vec3 | null;
  radius: number | null;
  center: Vec3 | null;
  axis: MeasureAxis | null;
}

export interface MeasuredBody {
  kind: "body";
  volume: number;
  area: number;
  centerOfMass: Vec3;
  bbox: { min: Vec3; max: Vec3 };
}

export type MeasuredItem = MeasuredVertex | MeasuredEdge | MeasuredFace | MeasuredBody;

export interface MeasuredPair {
  distance: number;
  points: [Vec3, Vec3];
  delta: Vec3;
  angle: number | null;
  axisDistance: number | null;
  centerDistance: number | null;
}

export interface MeasureResult {
  items: MeasuredItem[];
  pair: MeasuredPair | null;
}

interface Orientation {
  kind: "line" | "plane";
  direction: Vec3;
}

const PARALLEL_SINE = 1e-6;

function degrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function orientationOf(item: MeasuredItem): Orientation | null {
  if (item.kind === "edge" && item.direction) return { kind: "line", direction: item.direction };
  if (item.kind !== "face") return null;
  if (item.normal) return { kind: "plane", direction: item.normal };
  if (item.surface === "cylinder" && item.axis) return { kind: "line", direction: item.axis.direction };
  return null;
}

export function angleBetween(a: MeasuredItem, b: MeasuredItem): number | null {
  const first = orientationOf(a);
  const second = orientationOf(b);
  const u = first && unit(first.direction);
  const v = second && unit(second.direction);
  if (!first || !second || !u || !v) return null;
  const between = degrees(Math.acos(Math.min(1, Math.abs(dot(u, v)))));
  return first.kind === second.kind ? between : 90 - between;
}

function axisOf(item: MeasuredItem): MeasureAxis | null {
  if (item.kind === "edge" && item.curve === "circle") return item.axis;
  if (item.kind === "face" && item.surface === "cylinder") return item.axis;
  return null;
}

export function axisDistance(a: MeasuredItem, b: MeasuredItem): number | null {
  const first = axisOf(a);
  const second = axisOf(b);
  const u = first && unit(first.direction);
  const v = second && unit(second.direction);
  if (!first || !second || !u || !v) return null;
  if (magnitude(cross(u, v)) > PARALLEL_SINE) return null;
  return magnitude(cross(subtract(second.origin, first.origin), u));
}

function centerOf(item: MeasuredItem): Vec3 | null {
  if (item.kind === "vertex") return item.point;
  if (item.kind === "edge" && item.curve === "circle") return item.center;
  if (item.kind === "face" && item.surface === "sphere") return item.center;
  return null;
}

export function centerDistance(a: MeasuredItem, b: MeasuredItem): number | null {
  if (a.kind === "vertex" && b.kind === "vertex") return null;
  const first = centerOf(a);
  const second = centerOf(b);
  return first && second ? magnitude(subtract(second, first)) : null;
}

export function measuredPair(a: MeasuredItem, b: MeasuredItem, distance: number, points: [Vec3, Vec3]): MeasuredPair {
  return {
    distance,
    points,
    delta: subtract(points[1], points[0]),
    angle: angleBetween(a, b),
    axisDistance: axisDistance(a, b),
    centerDistance: centerDistance(a, b),
  };
}
