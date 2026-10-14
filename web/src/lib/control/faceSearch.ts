import type { Vec3 } from "@/lib/threadGeometry";
import type { MeshData } from "@/types/api";
import type { BodyTopology, TopologyFace } from "./topology";

const NORMAL_ALIGNMENT = 0.999;

export type TopologyPart = "all" | "faces" | "edges";

export interface TopologyFilter {
  include?: TopologyPart;
  planar?: boolean;
  normal?: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function unit(vector: Vec3): Vec3 | null {
  const length = Math.hypot(...vector);
  return length > 1e-12 ? scale(vector, 1 / length) : null;
}

export function facesAlong(faces: TopologyFace[], normal: Vec3): TopologyFace[] {
  const direction = unit(normal);
  if (!direction) return [];
  return faces.filter((face) => face.normal !== null && dot(face.normal, direction) >= NORMAL_ALIGNMENT);
}

export function filterTopology(topology: BodyTopology, filter: TopologyFilter): BodyTopology {
  const include = filter.include ?? "all";
  let faces = include === "edges" ? [] : topology.faces;
  if (filter.planar !== undefined) faces = faces.filter((face) => face.planar === filter.planar);
  if (filter.normal) faces = facesAlong(faces, filter.normal);
  const filtered = filter.planar !== undefined || filter.normal !== undefined;
  const faceEdges = new Set(faces.flatMap((face) => face.edgeIds));
  let edges = include === "faces" ? [] : topology.edges;
  if (filtered && include === "all") edges = edges.filter((edge) => faceEdges.has(edge.id));
  return { ...topology, faces, edges };
}

export function closestOnTriangle(p: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / (d1 - d3)));
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, scale(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  return add(a, add(scale(ab, vb * denom), scale(ac, vc * denom)));
}

function vertex(mesh: MeshData, index: number): Vec3 {
  return [mesh.vertices[index * 3], mesh.vertices[index * 3 + 1], mesh.vertices[index * 3 + 2]];
}

export function faceDistances(mesh: MeshData, point: Vec3): Map<string, number> {
  const distances = new Map<string, number>();
  for (let offset = 0; offset + 2 < mesh.indices.length; offset += 3) {
    const faceId = String(mesh.face_triangle_map[offset / 3]);
    const closest = closestOnTriangle(point, vertex(mesh, mesh.indices[offset]), vertex(mesh, mesh.indices[offset + 1]), vertex(mesh, mesh.indices[offset + 2]));
    const distance = Math.hypot(...sub(point, closest));
    if (distance < (distances.get(faceId) ?? Infinity)) distances.set(faceId, distance);
  }
  return distances;
}

export interface FoundFace extends Omit<TopologyFace, "edgeIds"> {
  distance: number | null;
}

export function findFaces(
  topology: BodyTopology,
  mesh: MeshData,
  query: { point?: Vec3; normal?: Vec3; planar?: boolean; limit: number },
): FoundFace[] {
  const candidates = filterTopology(topology, { include: "faces", planar: query.planar, normal: query.normal }).faces;
  const distances = query.point ? faceDistances(mesh, query.point) : null;
  const found = candidates.map(({ edgeIds: _edgeIds, ...face }) => ({
    ...face,
    distance: distances ? Math.round((distances.get(face.id) ?? Infinity) * 1e6) / 1e6 : null,
  }));
  found.sort((a, b) => (a.distance !== null && b.distance !== null ? a.distance - b.distance : b.area - a.area));
  return found.slice(0, query.limit);
}
