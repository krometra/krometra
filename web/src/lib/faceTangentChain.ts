import { brepEdgeCoordinates } from "./brepEdge";
import type { Vec3 } from "./threadGeometry";
import { cross, dot, magnitude, scale, subtract, unit } from "./vec3";
import type { MeshData } from "@/types/api";

export const TANGENT_FACE_TOLERANCE_DEG = 5;

interface Triangle {
  corners: [Vec3, Vec3, Vec3];
  normal: Vec3;
}

function vertexAt(vertices: ArrayLike<number>, index: number): Vec3 {
  return [vertices[index * 3], vertices[index * 3 + 1], vertices[index * 3 + 2]];
}

function faceTriangles(mesh: MeshData): Map<string, Triangle[]> {
  const faces = new Map<string, Triangle[]>();
  for (let offset = 0; offset + 2 < mesh.indices.length; offset += 3) {
    const faceId = mesh.face_triangle_map[offset / 3];
    if (faceId === undefined || faceId === null) continue;
    const corners: [Vec3, Vec3, Vec3] = [0, 1, 2].map((corner) => vertexAt(mesh.vertices, mesh.indices[offset + corner])) as [Vec3, Vec3, Vec3];
    const normal = unit(cross(subtract(corners[1], corners[0]), subtract(corners[2], corners[0])));
    if (!normal) continue;
    const key = String(faceId);
    faces.set(key, [...(faces.get(key) ?? []), { corners, normal }]);
  }
  return faces;
}

function segmentDistance(point: Vec3, start: Vec3, end: Vec3): number {
  const along = subtract(end, start);
  const length = dot(along, along);
  const t = length > 0 ? Math.min(1, Math.max(0, dot(subtract(point, start), along) / length)) : 0;
  return magnitude(subtract(point, [start[0] + along[0] * t, start[1] + along[1] * t, start[2] + along[2] * t]));
}

function triangleDistance(point: Vec3, triangle: Triangle): number {
  const [a, b, c] = triangle.corners;
  return Math.min(segmentDistance(point, a, b), segmentDistance(point, b, c), segmentDistance(point, c, a));
}

function normalNear(triangles: Triangle[] | undefined, point: Vec3): Vec3 | null {
  let best: Triangle | null = null;
  let bestDistance = Infinity;
  for (const triangle of triangles ?? []) {
    const distance = triangleDistance(point, triangle);
    if (distance < bestDistance) {
      best = triangle;
      bestDistance = distance;
    }
  }
  return best?.normal ?? null;
}

function edgeMiddle(points: Vec3[]): Vec3 | null {
  if (points.length < 2) return null;
  const index = Math.floor((points.length - 1) / 2);
  const [start, end] = [points[index], points[index + 1]];
  return scale([start[0] + end[0], start[1] + end[1], start[2] + end[2]], 0.5);
}

function edgeFaces(mesh: MeshData): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const face of mesh.brep_topo?.faces ?? []) {
    for (const edge of face.edges ?? []) {
      const key = String(edge);
      owners.set(key, [...(owners.get(key) ?? []), String(face.face_id)]);
    }
  }
  return owners;
}

export function tangentFaceChain(mesh: MeshData, startFaceId: string, toleranceDeg = TANGENT_FACE_TOLERANCE_DEG): string[] {
  const triangles = faceTriangles(mesh);
  const owners = edgeFaces(mesh);
  const limit = Math.cos((toleranceDeg * Math.PI) / 180);
  const neighbours = new Map<string, string[]>();
  for (const edge of mesh.brep_topo?.edges ?? []) {
    const faces = [...new Set(owners.get(String(edge.edge_id)) ?? [])];
    const middle = edgeMiddle(brepEdgeCoordinates(mesh.vertices, edge));
    if (faces.length !== 2 || !middle) continue;
    const [first, second] = faces.map((face) => normalNear(triangles.get(face), middle));
    if (!first || !second || Math.abs(dot(first, second)) < limit) continue;
    neighbours.set(faces[0], [...(neighbours.get(faces[0]) ?? []), faces[1]]);
    neighbours.set(faces[1], [...(neighbours.get(faces[1]) ?? []), faces[0]]);
  }
  const chain = [startFaceId];
  const seen = new Set(chain);
  for (let index = 0; index < chain.length; index++) {
    for (const next of neighbours.get(chain[index]) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      chain.push(next);
    }
  }
  return chain;
}
