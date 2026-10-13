import { describe, expect, it } from "vitest";
import { browserMeshData, type BrowserMeshNames } from "./browserMesh";

const noEdges = { lines: [], edgeGroups: [] };
const names = (faces: [number, string][] = [], edges: [number, string][] = [], faceEdges: [string, string[]][] = []): BrowserMeshNames => ({
  faces: new Map(faces),
  edges: new Map(edges),
  faceEdges: new Map(faceEdges),
});

describe("browserMeshData", () => {
  it("подписывает треугольники стабильными именами граней", () => {
    const mesh = browserMeshData({
      vertices: [0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4],
      triangles: [0, 1, 2, 0, 2, 3],
      faceGroups: [
        { start: 0, count: 3, faceId: 11 },
        { start: 3, count: 3, faceId: 12 },
      ],
    }, noEdges, names([[11, "f-top"], [12, "f-side"]], [], [["f-top", ["e-a"]]]));

    expect(mesh.face_triangle_map).toEqual(["f-top", "f-side"]);
    expect(mesh.brep_topo.faces).toEqual([{ face_id: "f-top", edges: ["e-a"] }, { face_id: "f-side", edges: [] }]);
    expect(mesh.bbox).toEqual({ min: [0, 0, 0], max: [2, 3, 4] });
  });

  it("отдаёт рёбра с именем и полилинией", () => {
    const mesh = browserMeshData({ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2], faceGroups: [{ start: 0, count: 3, faceId: 1 }] }, {
      lines: [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0],
      edgeGroups: [{ start: 0, count: 2, edgeId: 5 }, { start: 2, count: 2, edgeId: 6 }],
    }, names([[1, "f-a"]], [[5, "e-x"]]));

    expect(mesh.brep_topo.edges).toEqual([
      { edge_id: "e-x", vertices: [], polyline: [0, 0, 0, 1, 0, 0] },
      { edge_id: "#6", vertices: [], polyline: [1, 0, 0, 1, 1, 0] },
    ]);
  });

  it("вычисляет габариты без распаковки большого массива вершин", () => {
    const vertices = Array.from({ length: 150_000 }, (_, index) => index % 3);
    vertices[vertices.length - 3] = -5;
    vertices[vertices.length - 2] = 8;
    vertices[vertices.length - 1] = 13;

    const mesh = browserMeshData({ vertices, triangles: [0, 1, 2], faceGroups: [{ start: 0, count: 3, faceId: 1 }] }, noEdges, names());

    expect(mesh.bbox).toEqual({ min: [-5, 1, 2], max: [0, 8, 13] });
  });
});
