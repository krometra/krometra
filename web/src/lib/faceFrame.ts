import type { Vec3 } from "./threadGeometry";
import { cross, dot, magnitude, scale, subtract, unit } from "./vec3";

export interface FaceFrame {
  center: Vec3;
  normal: Vec3;
  radius: number;
}

export interface FaceMesh {
  vertices: ArrayLike<number>;
  indices: ArrayLike<number>;
  faceMap: ArrayLike<string | number>;
}

const PARALLEL_TOLERANCE = 0.999;
const FLATNESS_TOLERANCE = 1e-4;

function vertex(mesh: FaceMesh, index: number): Vec3 {
  return [mesh.vertices[index * 3], mesh.vertices[index * 3 + 1], mesh.vertices[index * 3 + 2]];
}

function faceTriangles(mesh: FaceMesh, faceId: string | number): Vec3[][] {
  const wanted = String(faceId);
  const triangles: Vec3[][] = [];
  for (let triangle = 0; triangle * 3 + 2 < mesh.indices.length; triangle++) {
    if (String(mesh.faceMap[triangle]) !== wanted) continue;
    triangles.push([0, 1, 2].map((corner) => vertex(mesh, mesh.indices[triangle * 3 + corner])));
  }
  return triangles;
}

function triangleArea(triangle: Vec3[]): Vec3 {
  return cross(subtract(triangle[1], triangle[0]), subtract(triangle[2], triangle[0]));
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function boxCenter(points: Vec3[]): Vec3 {
  const min = [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])));
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}

function isFlat(triangles: Vec3[][], points: Vec3[], normal: Vec3, size: number): boolean {
  const parallel = triangles.every((triangle) => {
    const direction = unit(triangleArea(triangle));
    return !direction || dot(direction, normal) > PARALLEL_TOLERANCE;
  });
  const level = dot(points[0], normal);
  const tolerance = FLATNESS_TOLERANCE * Math.max(1, size);
  return parallel && points.every((point) => Math.abs(dot(point, normal) - level) <= tolerance);
}

export function planarFaceFrame(mesh: FaceMesh, faceId: string | number): FaceFrame | null {
  const triangles = faceTriangles(mesh, faceId);
  if (triangles.length === 0) return null;
  const normal = unit(triangles.map(triangleArea).reduce(add, [0, 0, 0]));
  if (!normal) return null;
  const points = triangles.flat();
  const box = boxCenter(points);
  const center = subtract(box, scale(normal, dot(subtract(box, points[0]), normal)));
  const radius = Math.max(...points.map((point) => magnitude(subtract(point, center))));
  if (!isFlat(triangles, points, normal, radius)) return null;
  return { center, normal, radius };
}
