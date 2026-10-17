import type { MeshData } from "@/types/api";
import { browserFacePlane, browserFacePoints } from "./browserFacePlane";
import type { Vec3 } from "./threadGeometry";
import { cross, magnitude, subtract } from "./vec3";
import { WorkPlaneError, type EdgeRef, type FaceRef, type PointRef, type WorkPlaneGeometry } from "./workPlane";
import { sketchSourceOf } from "./workPlaneDocument";

const STRAIGHT_TOLERANCE = 1e-4;
const VERTEX_TOLERANCE = 1e-3;

type MeshOf = (bodyId: string) => MeshData | undefined;

function meshOrFail(meshOf: MeshOf, bodyId: string): MeshData {
  const mesh = meshOf(bodyId);
  if (!mesh) throw new WorkPlaneError("Тело, на которое опирается плоскость, удалено или ещё не загружено.");
  return mesh;
}

function centroid(points: Vec3[]): Vec3 {
  const sum = points.reduce<Vec3>((acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]], [0, 0, 0]);
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

export function meshFacePlane(mesh: MeshData, faceName: string): { point: Vec3; normal: Vec3 } | null {
  const plane = browserFacePlane(mesh, faceName);
  const points = browserFacePoints(mesh, faceName);
  if (!plane || points.length === 0) return null;
  return { point: centroid(points), normal: plane.basis.n as Vec3 };
}

function polylinePoints(polyline: number[] | undefined): Vec3[] {
  const values = polyline ?? [];
  const points: Vec3[] = [];
  for (let index = 0; index + 2 < values.length; index += 3) points.push([values[index], values[index + 1], values[index + 2]]);
  return points;
}

function distanceToLine(point: Vec3, start: Vec3, end: Vec3): number {
  const along = subtract(end, start);
  return magnitude(cross(subtract(point, start), along)) / magnitude(along);
}

export function meshEdgeLine(mesh: MeshData, edgeName: string): { start: Vec3; end: Vec3; straight: boolean } | null {
  const edge = mesh.brep_topo.edges.find((candidate) => String(candidate.edge_id) === edgeName);
  const points = polylinePoints(edge?.polyline);
  if (points.length < 2) return null;
  const start = points[0];
  const end = points[points.length - 1];
  const length = magnitude(subtract(end, start));
  const straight = length > 1e-9 && points.every((point) => distanceToLine(point, start, end) <= STRAIGHT_TOLERANCE * Math.max(1, length));
  return { start, end, straight };
}

export function meshWorkPlaneGeometry(meshOf: MeshOf, components: Record<string, unknown>): WorkPlaneGeometry {
  return {
    face: (ref: FaceRef) => {
      const plane = meshFacePlane(meshOrFail(meshOf, ref.bodyId), ref.faceName);
      if (!plane) throw new WorkPlaneError("Опорная грань не плоская: выберите плоскую грань.");
      return plane;
    },
    edge: (ref: EdgeRef) => {
      const line = meshEdgeLine(meshOrFail(meshOf, ref.bodyId), ref.edgeName);
      if (!line) throw new WorkPlaneError("Ребро, на которое опирается плоскость, не найдено.");
      return line;
    },
    sketch: (sketchId) => sketchSourceOf(components, sketchId),
  };
}

function edgeEnds(mesh: MeshData): { edgeName: string; ends: Vec3[] }[] {
  return mesh.brep_topo.edges
    .map((edge) => ({ edgeName: String(edge.edge_id), points: polylinePoints(edge.polyline) }))
    .filter((edge) => edge.points.length >= 2)
    .map((edge) => ({ edgeName: edge.edgeName, ends: [edge.points[0], edge.points[edge.points.length - 1]] }));
}

export function vertexRefAt(mesh: MeshData, bodyId: string, point: Vec3): PointRef | null {
  const touching = edgeEnds(mesh).filter((edge) => edge.ends.some((end) => magnitude(subtract(end, point)) <= VERTEX_TOLERANCE));
  if (touching.length === 0) return null;
  const [first, second] = touching;
  return { kind: "vertex", bodyId, edgeName: first.edgeName, adjacentEdgeName: (second ?? first).edgeName };
}
