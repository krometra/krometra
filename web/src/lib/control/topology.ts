import { brepEdgeCoordinates, isClosedPolyline, polylineLength } from "@/lib/brepEdge";
import type { Vec3 } from "@/lib/threadGeometry";
import type { MeshData } from "@/types/api";

const PLANAR_ALIGNMENT = 0.999;
const Z_LEVELS_PER_MM = 100;

export interface TopologyEdge {
  id: string;
  start: Vec3;
  end: Vec3;
  midpoint: Vec3;
  length: number;
  closed: boolean;
  polyline?: Vec3[];
}

export interface TopologyFace {
  id: string;
  edgeIds: string[];
  triangles: number;
  area: number;
  planar: boolean;
  normal: Vec3 | null;
  centroid: Vec3 | null;
  point: Vec3 | null;
  bbox: { min: Vec3; max: Vec3 } | null;
}

export interface BodyTopology {
  bodyId: string;
  bbox: { min: number[]; max: number[] };
  faces: TopologyFace[];
  edges: TopologyEdge[];
}

export interface MeshStats {
  vertices: number;
  triangles: number;
  openEdges: number;
  zLevels: number[];
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function rounded(point: Vec3): Vec3 {
  return [round(point[0]), round(point[1]), round(point[2])];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(...subtract(a, b));
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function vertexAt(vertices: number[], index: number): Vec3 {
  return [vertices[index * 3], vertices[index * 3 + 1], vertices[index * 3 + 2]];
}

function pointAlong(points: Vec3[], target: number): Vec3 {
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const step = distance(points[i - 1], points[i]);
    if (walked + step >= target && step > 0) return lerp(points[i - 1], points[i], (target - walked) / step);
    walked += step;
  }
  return points[points.length - 1];
}

function describeEdge(id: string, points: Vec3[], withPolyline: boolean): TopologyEdge {
  const start = points[0];
  const end = points[points.length - 1];
  const length = polylineLength(points);
  const edge: TopologyEdge = {
    id,
    start: rounded(start),
    end: rounded(end),
    midpoint: rounded(pointAlong(points, length / 2)),
    length: round(length),
    closed: isClosedPolyline(points),
  };
  if (withPolyline) edge.polyline = points.map(rounded);
  return edge;
}

interface FaceAccumulator {
  triangles: number;
  area: number;
  weighted: Vec3;
  normalSum: Vec3;
  normals: Vec3[];
  largestArea: number;
  point: Vec3 | null;
  min: Vec3;
  max: Vec3;
}

function emptyFace(): FaceAccumulator {
  return {
    triangles: 0,
    area: 0,
    weighted: [0, 0, 0],
    normalSum: [0, 0, 0],
    normals: [],
    largestArea: 0,
    point: null,
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}

function addTriangle(face: FaceAccumulator, a: Vec3, b: Vec3, c: Vec3) {
  const normal = cross(subtract(b, a), subtract(c, a));
  const doubled = Math.hypot(...normal);
  const area = doubled / 2;
  const center: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];

  face.triangles++;
  face.area += area;
  for (let k = 0; k < 3; k++) {
    face.weighted[k] += center[k] * area;
    face.normalSum[k] += normal[k];
    face.min[k] = Math.min(face.min[k], a[k], b[k], c[k]);
    face.max[k] = Math.max(face.max[k], a[k], b[k], c[k]);
  }
  if (doubled > 1e-12) face.normals.push([normal[0] / doubled, normal[1] / doubled, normal[2] / doubled]);
  if (area >= face.largestArea) {
    face.largestArea = area;
    face.point = center;
  }
}

function collectFaces(mesh: MeshData): Map<string, FaceAccumulator> {
  const faces = new Map<string, FaceAccumulator>();
  for (let offset = 0; offset + 2 < mesh.indices.length; offset += 3) {
    const faceId = mesh.face_triangle_map[offset / 3];
    if (faceId === undefined || faceId === null) continue;
    const key = String(faceId);
    const face = faces.get(key) ?? emptyFace();
    faces.set(key, face);
    addTriangle(
      face,
      vertexAt(mesh.vertices, mesh.indices[offset]),
      vertexAt(mesh.vertices, mesh.indices[offset + 1]),
      vertexAt(mesh.vertices, mesh.indices[offset + 2]),
    );
  }
  return faces;
}

function describeFace(id: string, edgeIds: string[], face: FaceAccumulator | undefined): TopologyFace {
  if (!face || face.area <= 0) {
    return { id, edgeIds, triangles: face?.triangles ?? 0, area: 0, planar: false, normal: null, centroid: null, point: null, bbox: null };
  }
  const length = Math.hypot(...face.normalSum);
  const mean: Vec3 | null = length > 1e-12 ? [face.normalSum[0] / length, face.normalSum[1] / length, face.normalSum[2] / length] : null;
  const planar = mean !== null && face.normals.every((normal) => dot(normal, mean) >= PLANAR_ALIGNMENT);
  return {
    id,
    edgeIds,
    triangles: face.triangles,
    area: round(face.area),
    planar,
    normal: planar && mean ? rounded(mean) : null,
    centroid: rounded([face.weighted[0] / face.area, face.weighted[1] / face.area, face.weighted[2] / face.area]),
    point: face.point ? rounded(face.point) : null,
    bbox: { min: rounded(face.min), max: rounded(face.max) },
  };
}

export function describeBodyTopology(bodyId: string, mesh: MeshData, options: { polylines?: boolean } = {}): BodyTopology {
  const topo = mesh.brep_topo ?? { faces: [], edges: [] };
  const triangleFaces = collectFaces(mesh);

  const edges: TopologyEdge[] = [];
  for (const edge of topo.edges ?? []) {
    const points = brepEdgeCoordinates(mesh.vertices, edge);
    if (points.length === 0) continue;
    edges.push(describeEdge(String(edge.edge_id), points, options.polylines === true));
  }

  const faces = (topo.faces ?? []).map((face) =>
    describeFace(String(face.face_id), (face.edges ?? []).map(String), triangleFaces.get(String(face.face_id))),
  );

  return { bodyId, bbox: { min: [...mesh.bbox.min], max: [...mesh.bbox.max] }, faces, edges };
}

function openEdgeCount(vertices: number[], indices: number[]): number {
  const keyOf = (index: number) => vertexAt(vertices, index).map((value) => value.toFixed(4)).join();
  const uses = new Map<string, number>();
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const corners = [keyOf(indices[offset]), keyOf(indices[offset + 1]), keyOf(indices[offset + 2])];
    for (let k = 0; k < 3; k++) {
      const key = [corners[k], corners[(k + 1) % 3]].sort().join("|");
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const count of uses.values()) if (count !== 2) open++;
  return open;
}

export function meshStats(mesh: MeshData): MeshStats {
  const levels = new Set<number>();
  for (let offset = 2; offset < mesh.vertices.length; offset += 3) {
    levels.add(Math.round(mesh.vertices[offset] * Z_LEVELS_PER_MM) / Z_LEVELS_PER_MM);
  }
  return {
    vertices: Math.floor(mesh.vertices.length / 3),
    triangles: Math.floor(mesh.indices.length / 3),
    openEdges: openEdgeCount(mesh.vertices, mesh.indices),
    zLevels: [...levels].sort((a, b) => a - b),
  };
}
