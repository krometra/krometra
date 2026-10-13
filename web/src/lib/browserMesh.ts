import type { MeshData } from "@/types/api";

export interface BrowserShapeMesh {
  vertices: number[];
  triangles: number[];
  faceGroups: { start: number; count: number; faceId: number }[];
}

export interface BrowserEdgeMesh {
  lines: number[];
  edgeGroups: { start: number; count: number; edgeId: number }[];
}

export interface BrowserMeshNames {
  faces: Map<number, string>;
  edges: Map<number, string>;
  faceEdges: Map<string, string[]>;
}

function boundingBox(vertices: number[]) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < vertices.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], vertices[index + axis]);
      max[axis] = Math.max(max[axis], vertices[index + axis]);
    }
  }
  return { min, max };
}

function nameOf(names: Map<number, string>, id: number): string {
  return names.get(id) ?? `#${id}`;
}

export function browserMeshData(raw: BrowserShapeMesh, edges: BrowserEdgeMesh, names: BrowserMeshNames): MeshData {
  const faceTriangleMap: string[] = Array(raw.triangles.length / 3).fill("");
  const faces = raw.faceGroups.map((group) => {
    const start = Math.floor(group.start / 3);
    const count = Math.floor(group.count / 3);
    const faceId = nameOf(names.faces, group.faceId);
    faceTriangleMap.fill(faceId, start, start + count);
    return { face_id: faceId, edges: names.faceEdges.get(faceId) ?? [] };
  });
  return {
    vertices: raw.vertices,
    indices: raw.triangles,
    brep_topo: {
      faces,
      edges: edges.edgeGroups.map((group) => ({
        edge_id: nameOf(names.edges, group.edgeId),
        vertices: [],
        polyline: edges.lines.slice(group.start * 3, (group.start + group.count) * 3),
      })),
    },
    bbox: boundingBox(raw.vertices),
    face_triangle_map: faceTriangleMap,
  };
}
