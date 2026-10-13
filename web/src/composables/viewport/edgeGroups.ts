import { polylineCoordinates } from "@/lib/brepEdge";
import type { Vec3 } from "@/lib/threadGeometry";
import { dot, scale, subtract, unit } from "@/lib/vec3";
import type { BrepTopo } from "@/types/api";

export type EdgeId = string | number;

export type EdgePick = { kind: "edge"; edgeId: EdgeId } | { kind: "face"; faceId: EdgeId };

export interface EdgeTopology {
  chains: Map<EdgeId, EdgeId[]>;
  faceEdges: Map<EdgeId, EdgeId[]>;
}

export const TANGENT_CHAIN_TOLERANCE_DEG = 5;

const VERTEX_MERGE_RELATIVE = 1e-6;
const VERTEX_MERGE_MIN = 1e-5;
const MAX_CHORD_TO_TANGENT_DEG = 30;
const DEG = Math.PI / 180;

export function polylinePoints(flat: number[] | undefined): Vec3[] {
  const points: Vec3[] = [];
  for (const point of polylineCoordinates(flat ?? [])) {
    const previous = points[points.length - 1];
    if (!previous || point.some((value, axis) => value !== previous[axis])) points.push(point);
  }
  return points;
}

// Хорда первого сегмента дуги отклонена от касательной на половину шага
// тесселяции, поэтому берётся касательная окружности через три крайние точки:
// инверсия относительно конца превращает её в прямую, параллельную касательной.
export function endTangent(end: Vec3, next: Vec3, afterNext?: Vec3): Vec3 | null {
  const chord = subtract(next, end);
  const chordDirection = unit(chord);
  if (!chordDirection || !afterNext) return chordDirection;
  const second = subtract(afterNext, end);
  const secondSq = dot(second, second);
  if (secondSq === 0) return chordDirection;
  const inverted = subtract(scale(chord, 1 / dot(chord, chord)), scale(second, 1 / secondSq));
  const tangent = unit(dot(inverted, chord) < 0 ? scale(inverted, -1) : inverted);
  if (!tangent || dot(tangent, chordDirection) < Math.cos(MAX_CHORD_TO_TANGENT_DEG * DEG)) return chordDirection;
  return tangent;
}

function vertexIndexer(tolerance: number) {
  const cells = new Map<string, number[]>();
  const vertices: Vec3[] = [];
  const cellOf = (point: Vec3) => point.map((value) => Math.floor(value / tolerance));
  return (point: Vec3): number => {
    const [cx, cy, cz] = cellOf(point);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const candidate of cells.get(`${cx + dx}/${cy + dy}/${cz + dz}`) ?? []) {
            const delta = subtract(vertices[candidate], point);
            if (dot(delta, delta) <= tolerance * tolerance) return candidate;
          }
        }
      }
    }
    const key = `${cx}/${cy}/${cz}`;
    vertices.push(point);
    cells.set(key, [...(cells.get(key) ?? []), vertices.length - 1]);
    return vertices.length - 1;
  };
}

function mergeTolerance(curves: Vec3[][]): number {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const points of curves) {
    for (const point of points) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
  }
  const diagonal = Math.hypot(...subtract(max, min));
  return Math.max(VERTEX_MERGE_MIN, Number.isFinite(diagonal) ? diagonal * VERTEX_MERGE_RELATIVE : 0);
}

interface EdgeEnd {
  edge: number;
  outward: Vec3;
}

function edgeEnds(curves: Vec3[][]): Map<number, EdgeEnd[]> {
  const vertexOf = vertexIndexer(mergeTolerance(curves));
  const ends = new Map<number, EdgeEnd[]>();
  curves.forEach((points, edge) => {
    if (points.length < 2) return;
    const last = points.length - 1;
    const sides: [Vec3, Vec3 | null][] = [
      [points[0], endTangent(points[0], points[1], points[2])],
      [points[last], endTangent(points[last], points[last - 1], points[last - 2])],
    ];
    for (const [point, outward] of sides) {
      if (!outward) continue;
      const vertex = vertexOf(point);
      ends.set(vertex, [...(ends.get(vertex) ?? []), { edge, outward }]);
    }
  });
  return ends;
}

function tangentChains(curves: Vec3[][], toleranceDeg: number): number[][] {
  const parent = curves.map((_, index) => index);
  const root = (index: number): number => (parent[index] === index ? index : (parent[index] = root(parent[index])));
  const continues = -Math.cos(toleranceDeg * DEG);
  for (const ends of edgeEnds(curves).values()) {
    for (let a = 0; a < ends.length; a++) {
      for (let b = a + 1; b < ends.length; b++) {
        if (ends[a].edge !== ends[b].edge && dot(ends[a].outward, ends[b].outward) <= continues) {
          parent[root(ends[a].edge)] = root(ends[b].edge);
        }
      }
    }
  }
  const chains = new Map<number, number[]>();
  curves.forEach((_, index) => chains.set(root(index), [...(chains.get(root(index)) ?? []), index]));
  return [...chains.values()];
}

function edgesBetweenTwoFaces(topo: BrepTopo): Map<EdgeId, EdgeId[]> {
  const faceCount = new Map<EdgeId, number>();
  const unique = topo.faces.map((face) => [...new Set(face.edges)]);
  for (const edges of unique) {
    for (const edge of edges) faceCount.set(edge, (faceCount.get(edge) ?? 0) + 1);
  }
  return new Map(topo.faces.map((face, index) => [
    face.face_id,
    unique[index].filter((edge) => (faceCount.get(edge) ?? 0) > 1),
  ]));
}

export function buildEdgeTopology(topo: BrepTopo, toleranceDeg = TANGENT_CHAIN_TOLERANCE_DEG): EdgeTopology {
  const ids = topo.edges.map((edge) => edge.edge_id);
  const chains = new Map<EdgeId, EdgeId[]>();
  for (const indices of tangentChains(topo.edges.map((edge) => polylinePoints(edge.polyline)), toleranceDeg)) {
    const chain = indices.map((index) => ids[index]);
    for (const id of chain) chains.set(id, chain);
  }
  return { chains, faceEdges: edgesBetweenTwoFaces(topo) };
}

function chainOf(topology: EdgeTopology, edgeId: EdgeId): EdgeId[] {
  return topology.chains.get(edgeId) ?? [edgeId];
}

export function pickedEdges(topology: EdgeTopology, pick: EdgePick, chain: boolean): EdgeId[] {
  if (pick.kind === "face") return topology.faceEdges.get(pick.faceId) ?? [];
  return chain ? chainOf(topology, pick.edgeId) : [pick.edgeId];
}

export function togglePicked(selected: EdgeId[], picked: EdgeId[], pick: EdgePick): EdgeId[] {
  const current = new Set(selected);
  const removes = pick.kind === "edge" ? current.has(pick.edgeId) : picked.every((id) => current.has(id));
  if (removes) {
    const dropped = new Set(picked);
    return selected.filter((id) => !dropped.has(id));
  }
  return [...selected, ...picked.filter((id) => !current.has(id))];
}

export function selectionGroups(topology: EdgeTopology, selected: EdgeId[], chain: boolean): EdgeId[][] {
  if (!chain) return selected.map((id) => [id]);
  const groups = new Map<EdgeId[], EdgeId[]>();
  for (const id of selected) {
    const key = chainOf(topology, id);
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  return [...groups.values()];
}
