import type { MeshData } from "@/types/api";

type Corner = [number, number, number];

export const A = 10;
export const B = 6;
export const C = 4;

export const BOX_FACES: Record<string, Corner[]> = {
  bottom: [[0, 0, 0], [0, B, 0], [A, B, 0], [A, 0, 0]],
  top: [[0, 0, C], [A, 0, C], [A, B, C], [0, B, C]],
  front: [[0, 0, 0], [A, 0, 0], [A, 0, C], [0, 0, C]],
  back: [[0, B, 0], [0, B, C], [A, B, C], [A, B, 0]],
  left: [[0, 0, 0], [0, 0, C], [0, B, C], [0, B, 0]],
  right: [[A, 0, 0], [A, B, 0], [A, B, C], [A, 0, C]],
};

export function boxMesh(): MeshData {
  const vertices: number[] = [];
  const indices: number[] = [];
  const faceTriangleMap: string[] = [];
  for (const [faceId, corners] of Object.entries(BOX_FACES)) {
    const base = vertices.length / 3;
    vertices.push(...corners.flat());
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    faceTriangleMap.push(faceId, faceId);
  }
  return {
    vertices,
    indices,
    face_triangle_map: faceTriangleMap,
    bbox: { min: [0, 0, 0], max: [A, B, C] },
    brep_topo: {
      faces: Object.keys(BOX_FACES).map((faceId) => ({ face_id: faceId, edges: [1, "top-front"] })),
      edges: [
        { edge_id: 1, vertices: [], polyline: [0, 0, 0, A, 0, 0] },
        { edge_id: "top-front", vertices: [4, 5] },
      ],
    },
  };
}
