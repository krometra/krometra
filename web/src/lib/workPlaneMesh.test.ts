import { describe, expect, it } from "vitest";
import type { MeshData } from "@/types/api";
import { computeWorkPlaneFrame } from "./workPlane";
import { meshEdgeLine, meshFacePlane, meshWorkPlaneGeometry, vertexRefAt } from "./workPlaneMesh";

function mesh(): MeshData {
  return {
    vertices: [0, 0, 10, 20, 0, 10, 20, 10, 10, 0, 10, 10],
    indices: [0, 1, 2, 0, 2, 3],
    face_triangle_map: ["f-top", "f-top"],
    bbox: { min: [0, 0, 0], max: [20, 10, 10] },
    brep_topo: {
      faces: [{ face_id: "f-top", edges: ["e-x", "e-y"] }],
      edges: [
        { edge_id: "e-x", vertices: [], polyline: [0, 0, 10, 10, 0, 10, 20, 0, 10] },
        { edge_id: "e-y", vertices: [], polyline: [0, 10, 10, 0, 0, 10] },
        { edge_id: "e-arc", vertices: [], polyline: [20, 0, 10, 21, 1, 10, 20, 2, 10] },
      ],
    },
  } as MeshData;
}

describe("опоры рабочей плоскости по мешу тела", () => {
  it("плоская грань: центр и нормаль", () => {
    expect(meshFacePlane(mesh(), "f-top")).toEqual({ point: [10, 5, 10], normal: [0, 0, 1] });
    expect(meshFacePlane(mesh(), "f-none")).toBeNull();
  });

  it("ребро: концы полилинии и признак прямоты", () => {
    expect(meshEdgeLine(mesh(), "e-x")).toEqual({ start: [0, 0, 10], end: [20, 0, 10], straight: true });
    expect(meshEdgeLine(mesh(), "e-arc")?.straight).toBe(false);
    expect(meshEdgeLine(mesh(), "e-none")).toBeNull();
  });

  it("вершина по точке клика — общий конец двух рёбер", () => {
    expect(vertexRefAt(mesh(), "b1", [0, 0, 10])).toEqual({ kind: "vertex", bodyId: "b1", edgeName: "e-x", adjacentEdgeName: "e-y" });
    expect(vertexRefAt(mesh(), "b1", [5, 5, 5])).toBeNull();
  });

  it("строит плоскость под углом через ребро по мешу и отказывает без тела", () => {
    const geometry = meshWorkPlaneGeometry((bodyId) => (bodyId === "b1" ? mesh() : undefined), {});
    const frame = computeWorkPlaneFrame({ kind: "angle", axis: { kind: "edge", bodyId: "b1", edgeName: "e-x" }, reference: { kind: "face", bodyId: "b1", faceName: "f-top" }, angle: 90 }, geometry);
    expect(frame.origin).toEqual([10, 0, 10]);
    expect(Math.abs(frame.n[1])).toBeCloseTo(1, 9);
    expect(() => geometry.face({ bodyId: "b2", faceName: "f-top" })).toThrow(/удалено/);
    expect(() => geometry.sketch("s1")).toThrow(/удалён/);
  });
});
