import type { MeshData, PlaneBasis, SketchPlane, SketchPoint } from "@/types/api";

type Vector3 = [number, number, number];

const PLANAR_TOLERANCE = 1e-5;
const AXIS_TOLERANCE = 1e-6;

const BASE_PLANES: [SketchPlane, Vector3, Vector3, Vector3][] = [
  ["XY", [1, 0, 0], [0, 1, 0], [0, 0, 1]],
  ["XZ", [1, 0, 0], [0, 0, 1], [0, 1, 0]],
  ["YZ", [0, 1, 0], [0, 0, 1], [1, 0, 0]],
];
const NORMAL_TOLERANCE = 0.999;

function subtract(a: Vector3, b: Vector3): Vector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(vector: Vector3): Vector3 | null {
  const length = Math.hypot(...vector);
  if (length < 1e-9) return null;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function pointAt(vertices: number[], index: number): Vector3 {
  return [vertices[index * 3], vertices[index * 3 + 1], vertices[index * 3 + 2]];
}

function faceTriangles(mesh: MeshData, faceId: string | number): number[][] {
  const triangles: number[][] = [];
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    if (String(mesh.face_triangle_map[offset / 3]) !== String(faceId)) continue;
    triangles.push([mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]]);
  }
  return triangles;
}

function faceBoundaryEdges(mesh: MeshData, faceId: string | number) {
  const edges = new Map<string, { start: number; end: number; count: number }>();
  for (const triangle of faceTriangles(mesh, faceId)) {
    for (const [start, end] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const key = start < end ? `${start}:${end}` : `${end}:${start}`;
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { start, end, count: 1 });
    }
  }
  return [...edges.values()].filter((edge) => edge.count === 1);
}

export function browserFacePoints(mesh: MeshData, faceId: string | number, limit = Infinity): Vector3[] {
  const indices = [...new Set(faceTriangles(mesh, faceId).flat())];
  const step = Number.isFinite(limit) ? Math.max(1, Math.floor(indices.length / limit)) : 1;
  return indices.filter((_, position) => position % step === 0).slice(0, limit).map((index) => pointAt(mesh.vertices, index));
}

export interface BrowserFacePlane {
  plane: SketchPlane;
  planeOffset: number;
  basis: PlaneBasis;
}

export function browserFacePlane(mesh: MeshData, faceId: string | number): BrowserFacePlane | null {
  const triangles = faceTriangles(mesh, faceId).map((triangle) => triangle.map((index) => pointAt(mesh.vertices, index)) as Vector3[]);

  const firstTriangle = triangles.find(([a, b, c]) => normalize(cross(subtract(b, a), subtract(c, a))));
  if (!firstTriangle) return null;
  const [origin, second, third] = firstTriangle;
  const normal = normalize(cross(subtract(second, origin), subtract(third, origin)));
  const perimeterEdge = faceBoundaryEdges(mesh, faceId)
    .map((edge) => ({ edge, direction: subtract(pointAt(mesh.vertices, edge.end), pointAt(mesh.vertices, edge.start)) }))
    .sort((a, b) => Math.hypot(...b.direction) - Math.hypot(...a.direction))[0];
  const u = normalize(perimeterEdge?.direction ?? subtract(second, origin));
  if (!normal || !u) return null;
  const v = normalize(cross(normal, u));
  if (!v) return null;

  for (const triangle of triangles) {
    const triangleNormal = normalize(cross(subtract(triangle[1], triangle[0]), subtract(triangle[2], triangle[0])));
    if (triangleNormal && dot(normal, triangleNormal) < NORMAL_TOLERANCE) return null;
    if (triangle.some((point) => Math.abs(dot(subtract(point, origin), normal)) > PLANAR_TOLERANCE)) return null;
  }

  return alignedFacePlane(origin, normal) ?? { plane: "XY", planeOffset: 0, basis: { origin, u, v, n: normal } };
}

export function alignedFacePlane(point: Vector3, normal: Vector3): BrowserFacePlane | null {
  for (const [plane, u, v, n] of BASE_PLANES) {
    const alignment = dot(normal, n);
    const offset = dot(point, normal);
    if (alignment > 1 - AXIS_TOLERANCE) {
      return { plane, planeOffset: offset, basis: { origin: [n[0] * offset, n[1] * offset, n[2] * offset], u, v, n: normal } };
    }
    if (alignment < -1 + AXIS_TOLERANCE) {
      return { plane, planeOffset: -offset, basis: { origin: [-n[0] * offset, -n[1] * offset, -n[2] * offset], u, v: [-v[0], -v[1], -v[2]], n: normal } };
    }
  }
  return null;
}

export function browserFaceBoundary(mesh: MeshData, faceId: string | number, basis: PlaneBasis): SketchPoint[][] {
  return faceBoundaryEdges(mesh, faceId)
    .map((edge) => [edge.start, edge.end].map((index) => {
      const point = subtract(pointAt(mesh.vertices, index), basis.origin as Vector3);
      return { x: dot(point, basis.u as Vector3), y: dot(point, basis.v as Vector3) };
    }));
}
