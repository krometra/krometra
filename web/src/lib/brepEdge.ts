import type { BrepTopoEdge } from "@/types/api";
import type { Vec3 } from "./threadGeometry";
import { magnitude, subtract } from "./vec3";

const CLOSED_POLYLINE_GAP = 1e-6;

function pointAt(values: ArrayLike<number>, index: number): Vec3 {
  return [values[index * 3], values[index * 3 + 1], values[index * 3 + 2]];
}

export function polylineCoordinates(flat: ArrayLike<number>): Vec3[] {
  return Array.from({ length: Math.floor(flat.length / 3) }, (_, index) => pointAt(flat, index));
}

export function brepEdgeCoordinates(positions: ArrayLike<number>, edge: BrepTopoEdge): Vec3[] {
  const flat = edge.polyline ?? [];
  if (flat.length >= 6) return polylineCoordinates(flat);
  return edge.vertices.filter((index) => index * 3 + 2 < positions.length).map((index) => pointAt(positions, index));
}

export function polylineLength(points: Vec3[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += magnitude(subtract(points[i], points[i - 1]));
  return length;
}

export function isClosedPolyline(points: Vec3[]): boolean {
  return points.length > 2 && magnitude(subtract(points[points.length - 1], points[0])) < CLOSED_POLYLINE_GAP;
}
