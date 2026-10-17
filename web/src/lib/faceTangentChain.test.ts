import { describe, expect, it } from "vitest";
import type { MeshData } from "@/types/api";
import { tangentFaceChain } from "./faceTangentChain";

type Point = [number, number, number];

function quadMesh(quads: { id: string; corners: [Point, Point, Point, Point]; edges: string[] }[], edges: { id: string; from: Point; to: Point }[]): MeshData {
  const vertices: number[] = [];
  const indices: number[] = [];
  const faceTriangleMap: string[] = [];
  for (const quad of quads) {
    const base = vertices.length / 3;
    quad.corners.forEach((corner) => vertices.push(...corner));
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    faceTriangleMap.push(quad.id, quad.id);
  }
  return {
    vertices,
    indices,
    face_triangle_map: faceTriangleMap,
    brep_topo: {
      faces: quads.map((quad) => ({ face_id: quad.id, edges: quad.edges })),
      edges: edges.map((edge) => ({ edge_id: edge.id, vertices: [], polyline: [...edge.from, ...edge.to] })),
    },
    bbox: { min: [0, 0, 0], max: [2, 1, 1] },
  } as unknown as MeshData;
}

const mesh = quadMesh(
  [
    { id: "f-a", corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], edges: ["e-ab"] },
    { id: "f-b", corners: [[1, 0, 0], [2, 0, 0.05], [2, 1, 0.05], [1, 1, 0]], edges: ["e-ab", "e-bc"] },
    { id: "f-c", corners: [[2, 0, 0.05], [2, 0, 1], [2, 1, 1], [2, 1, 0.05]], edges: ["e-bc", "e-cd"] },
    { id: "f-d", corners: [[2, 0, 1], [1.2, 0, 1.6], [1.2, 1, 1.6], [2, 1, 1]], edges: ["e-cd"] },
  ],
  [
    { id: "e-ab", from: [1, 0, 0], to: [1, 1, 0] },
    { id: "e-bc", from: [2, 0, 0.05], to: [2, 1, 0.05] },
    { id: "e-cd", from: [2, 0, 1], to: [2, 1, 1] },
  ],
);

describe("tangentFaceChain", () => {
  it("идёт через почти касательный стык и останавливается на остром", () => {
    expect(tangentFaceChain(mesh, "f-a")).toEqual(["f-a", "f-b"]);
    expect(tangentFaceChain(mesh, "f-b")).toEqual(["f-b", "f-a"]);
  });

  it("грань без касательных соседей — цепочка из неё одной", () => {
    expect(tangentFaceChain(mesh, "f-c")).toEqual(["f-c"]);
    expect(tangentFaceChain(mesh, "f-d")).toEqual(["f-d"]);
  });

  it("допуск по углу задаётся параметром", () => {
    expect(tangentFaceChain(mesh, "f-a", 1)).toEqual(["f-a"]);
    expect(tangentFaceChain(mesh, "f-c", 60)).toEqual(["f-c", "f-d"]);
  });

  it("неизвестная грань возвращается как есть", () => {
    expect(tangentFaceChain(mesh, "f-missing")).toEqual(["f-missing"]);
  });
});
