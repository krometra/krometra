import type { Vec3 } from "@/lib/threadGeometry";
import type { MeshData } from "@/types/api";

export interface PressPullArrow {
  origin: Vec3;
  direction: Vec3;
  length: number;
}

export interface PressPullGhost {
  positions: number[];
  arrows: PressPullArrow[];
}

const ARROW_SHARE_OF_MODEL = 0.12;

function vertex(mesh: MeshData, index: number): Vec3 {
  return [mesh.vertices[index * 3], mesh.vertices[index * 3 + 1], mesh.vertices[index * 3 + 2]];
}

function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

function unit(vector: Vec3): Vec3 {
  const length = Math.hypot(...vector);
  return length > 1e-12 ? [vector[0] / length, vector[1] / length, vector[2] / length] : [0, 0, 0];
}

function faceTriangles(mesh: MeshData, faceId: string): number[][] {
  const triangles: number[][] = [];
  mesh.face_triangle_map.forEach((id, triangle) => {
    if (String(id) === faceId) triangles.push([0, 1, 2].map((corner) => mesh.indices[triangle * 3 + corner]));
  });
  return triangles;
}

function vertexNormals(mesh: MeshData, triangles: number[][]): Map<number, Vec3> {
  const sums = new Map<number, Vec3>();
  for (const corners of triangles) {
    const normal = triangleNormal(vertex(mesh, corners[0]), vertex(mesh, corners[1]), vertex(mesh, corners[2]));
    for (const corner of corners) {
      const sum = sums.get(corner) ?? [0, 0, 0];
      sums.set(corner, [sum[0] + normal[0], sum[1] + normal[1], sum[2] + normal[2]]);
    }
  }
  return new Map([...sums].map(([corner, sum]) => [corner, unit(sum)]));
}

function largestTriangle(mesh: MeshData, triangles: number[][]): number[] {
  let best = triangles[0];
  let bestArea = -1;
  for (const corners of triangles) {
    const area = Math.hypot(...triangleNormal(vertex(mesh, corners[0]), vertex(mesh, corners[1]), vertex(mesh, corners[2])));
    if (area > bestArea) {
      best = corners;
      bestArea = area;
    }
  }
  return best;
}

function arrowFor(mesh: MeshData, triangles: number[][], distance: number, minimum: number): PressPullArrow {
  const corners = largestTriangle(mesh, triangles).map((index) => vertex(mesh, index));
  const normal = unit(triangleNormal(corners[0], corners[1], corners[2]));
  const sign = Math.sign(distance);
  return {
    origin: [0, 1, 2].map((axis) => (corners[0][axis] + corners[1][axis] + corners[2][axis]) / 3) as Vec3,
    direction: [normal[0] * sign, normal[1] * sign, normal[2] * sign],
    length: Math.max(Math.abs(distance), minimum),
  };
}

export function modelArrowLength(mesh: MeshData): number {
  const { min, max } = mesh.bbox;
  return Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * ARROW_SHARE_OF_MODEL;
}

export function pressPullGhost(mesh: MeshData, faceIds: (string | number)[], distance: number): PressPullGhost {
  const positions: number[] = [];
  const arrows: PressPullArrow[] = [];
  const minimum = modelArrowLength(mesh);
  for (const faceId of faceIds) {
    const triangles = faceTriangles(mesh, String(faceId));
    if (triangles.length === 0) continue;
    const normals = vertexNormals(mesh, triangles);
    for (const corners of triangles) {
      for (const corner of corners) {
        const point = vertex(mesh, corner);
        const normal = normals.get(corner)!;
        positions.push(point[0] + normal[0] * distance, point[1] + normal[1] * distance, point[2] + normal[2] * distance);
      }
    }
    arrows.push(arrowFor(mesh, triangles, distance, minimum));
  }
  return { positions, arrows };
}
