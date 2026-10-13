import { describe, expect, it } from "vitest";
import type { MeshData } from "@/types/api";
import { browserExtentMeshPoints, browserSpanFromPoints } from "./browserExtentTarget";
import type { BrowserExtrudeExtent } from "./browserExtrudeExtent";

const box: MeshData = {
  vertices: [0, 0, 5, 4, 0, 5, 4, 4, 5, 0, 4, 9],
  indices: [0, 1, 2, 0, 2, 3],
  brep_topo: { faces: [{ face_id: 1, edges: [] }, { face_id: 2, edges: [] }], edges: [] },
  bbox: { min: [0, 0, 5], max: [4, 4, 9] },
  face_triangle_map: [1, 2],
};

const meshOf = (bodyId: string | null) => (bodyId === "body" ? box : undefined);
const targets = { targetBodyId: "body", upToBodyId: "body", upToFace: { bodyId: "body", faceId: 1 } };

const extent = (patch: Partial<BrowserExtrudeExtent>): BrowserExtrudeExtent => ({
  extentType: "distance", direction: "one_side", distance: 1, backDistance: 0, offset: 0, operation: "join", ...patch,
});

describe("browserExtentMeshPoints", () => {
  it("берёт углы габаритов для «насквозь», вершины тела и грани для «до»", () => {
    expect(browserExtentMeshPoints("through_all", targets, meshOf)).toHaveLength(8);
    expect(browserExtentMeshPoints("up_to_body", targets, meshOf)).toHaveLength(4);
    expect(browserExtentMeshPoints("up_to_face", targets, meshOf)).toEqual([[0, 0, 5], [4, 0, 5], [4, 4, 5]]);
  });

  it("не возвращает точек без цели или для расстояния", () => {
    expect(browserExtentMeshPoints("distance", targets, meshOf)).toBeNull();
    expect(browserExtentMeshPoints("up_to_face", { ...targets, upToFace: null }, meshOf)).toBeNull();
    expect(browserExtentMeshPoints("up_to_body", { ...targets, upToBodyId: "missing" }, meshOf)).toBeNull();
  });
});

describe("browserSpanFromPoints", () => {
  const placement = { plane: "XY" as const, planeOffset: 2, planeBasis: null };

  it("считает длину до грани от плоскости эскиза со смещением", () => {
    const points = browserExtentMeshPoints("up_to_face", targets, meshOf);
    expect(browserSpanFromPoints(placement, extent({ extentType: "up_to_face", offset: 1 }), points)).toEqual({ start: 0, end: 4 });
  });

  it("доводит до ближней вершины тела", () => {
    const points = browserExtentMeshPoints("up_to_body", targets, meshOf);
    expect(browserSpanFromPoints(placement, extent({ extentType: "up_to_body" }), points)).toEqual({ start: 0, end: 3 });
  });

  it("проходит тело насквозь с запасом", () => {
    const points = browserExtentMeshPoints("through_all", targets, meshOf);
    expect(browserSpanFromPoints(placement, extent({ extentType: "through_all" }), points)).toEqual({ start: 0, end: 8 });
  });
});
