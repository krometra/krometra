import { isClosedPolyline, polylineLength } from "@/lib/brepEdge";
import { pluralize } from "@/lib/plural";
import type { Vec3 } from "@/lib/threadGeometry";
import { cross, dot, magnitude, subtract } from "@/lib/vec3";
import type { BrepTopo } from "@/types/api";
import { polylinePoints, type EdgeId } from "./edgeGroups";

export interface EdgeGroupRow {
  key: string;
  edgeIds: EdgeId[];
  label: string;
}

export type EdgeShape =
  | { kind: "line"; length: number }
  | { kind: "arc"; length: number; radius: number }
  | { kind: "circle"; length: number; radius: number }
  | { kind: "curve"; length: number };

const ABSOLUTE_TOLERANCE = 1e-4;
const RELATIVE_TOLERANCE = 1e-4;

function tolerance(size: number): number {
  return Math.max(ABSOLUTE_TOLERANCE, size * RELATIVE_TOLERANCE);
}

function isStraight(points: Vec3[], length: number): boolean {
  const axis = subtract(points[points.length - 1], points[0]);
  const span = magnitude(axis);
  if (span <= tolerance(length)) return false;
  return points.every((point) => magnitude(cross(subtract(point, points[0]), axis)) / span <= tolerance(length));
}

function circleRadius(points: Vec3[]): number | null {
  const a = points[0];
  const ab = subtract(points[Math.floor(points.length / 3)], a);
  const ac = subtract(points[Math.floor((2 * points.length) / 3)], a);
  const normal = cross(ab, ac);
  const normalSq = dot(normal, normal);
  if (normalSq === 0) return null;
  const alongAb = cross(normal, ab);
  const alongAc = cross(ac, normal);
  const toCentre = alongAb.map((value, axis) => (
    (dot(ac, ac) * value + dot(ab, ab) * alongAc[axis]) / (2 * normalSq)
  )) as Vec3;
  const radius = magnitude(toCentre);
  const planeNormal = normal.map((value) => value / Math.sqrt(normalSq)) as Vec3;
  const fits = points.every((point) => {
    const offset = subtract(subtract(point, a), toCentre);
    return Math.abs(magnitude(offset) - radius) <= tolerance(radius) && Math.abs(dot(offset, planeNormal)) <= tolerance(radius);
  });
  return fits ? radius : null;
}

function sweptAngle(points: Vec3[], radius: number): number {
  let angle = 0;
  for (let i = 1; i < points.length; i++) {
    angle += 2 * Math.asin(Math.min(1, magnitude(subtract(points[i], points[i - 1])) / (2 * radius)));
  }
  return angle;
}

export function describeEdge(polyline: number[] | undefined): EdgeShape {
  const points = polylinePoints(polyline);
  const length = polylineLength(points);
  if (points.length < 3 || isStraight(points, length)) return { kind: "line", length };
  const radius = circleRadius(points);
  if (radius === null) return { kind: "curve", length };
  if (isClosedPolyline(points)) return { kind: "circle", length: 2 * Math.PI * radius, radius };
  return { kind: "arc", length: radius * sweptAngle(points, radius), radius };
}

function rounded(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function edgeLabel(shape: EdgeShape): string {
  if (shape.kind === "line") return `Отрезок ${rounded(shape.length)} мм`;
  if (shape.kind === "arc") return `Дуга R${rounded(shape.radius)} · ${rounded(shape.length)} мм`;
  if (shape.kind === "circle") return `Окружность ⌀${rounded(2 * shape.radius)} мм`;
  return `Кривая ${rounded(shape.length)} мм`;
}

export function edgeGroupLabel(shapes: EdgeShape[]): string {
  if (shapes.length === 1) return edgeLabel(shapes[0]);
  const total = shapes.reduce((sum, shape) => sum + shape.length, 0);
  return `Цепочка: ${pluralize(shapes.length, "ребро", "ребра", "рёбер")} · ${rounded(total)} мм`;
}

export function edgeGroupRows(topo: BrepTopo | null, groups: EdgeId[][]): EdgeGroupRow[] {
  const polylines = new Map((topo?.edges ?? []).map((edge) => [edge.edge_id, edge.polyline]));
  return groups.map((edgeIds) => ({
    key: String(edgeIds[0]),
    edgeIds,
    label: edgeGroupLabel(edgeIds.map((id) => describeEdge(polylines.get(id)))),
  }));
}
