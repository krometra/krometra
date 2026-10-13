import { describe, expect, it } from "vitest";
import { browserFaceBoundary, browserFacePlane, browserFacePoints } from "./browserFacePlane";

const planarMesh = {
  vertices: [0, 0, 2, 2, 0, 2, 2, 3, 2, 0, 3, 2],
  indices: [0, 1, 2, 0, 2, 3],
  brep_topo: { faces: [{ face_id: 7, edges: [] }], edges: [] },
  bbox: { min: [0, 0, 2], max: [2, 3, 2] },
  face_triangle_map: [7, 7],
};

describe("browserFacePlane", () => {
  it("строит базис из плоской грани browser mesh", () => {
    const face = browserFacePlane(planarMesh, 7);

    expect(face?.plane).toBe("XY");
    expect(face?.planeOffset).toBe(2);
    expect(face?.basis.origin).toEqual([0, 0, 2]);
    expect(face?.basis.u).toEqual([1, 0, 0]);
    expect(face?.basis.n).toEqual([0, 0, 1]);
    expect(Math.abs(face!.basis.u[0] * face!.basis.u[1])).toBeLessThan(1e-9);
  });

  it("совмещает начало эскиза на грани с проекцией мирового начала", () => {
    const shifted = { ...planarMesh, vertices: [5, 5, 2, 7, 5, 2, 7, 8, 2, 5, 8, 2] };
    const face = browserFacePlane(shifted, 7);

    expect(face?.basis.origin).toEqual([0, 0, 2]);
    expect(face?.basis.v).toEqual([0, 1, 0]);
  });

  it("для грани против оси зеркалит v и сохраняет правую тройку", () => {
    const bottom = { ...planarMesh, indices: [0, 2, 1, 0, 3, 2] };
    const face = browserFacePlane(bottom, 7);

    expect(face?.basis.n).toEqual([0, 0, -1]);
    expect(face?.basis.u).toEqual([1, 0, 0]);
    expect(face?.basis.v).toEqual([-0, -1, -0]);
    expect(face?.basis.origin).toEqual([0, 0, 2]);
  });

  it("отклоняет неплоскую грань", () => {
    const nonPlanar = { ...planarMesh, vertices: [...planarMesh.vertices] };
    nonPlanar.vertices[11] = 3;

    expect(browserFacePlane(nonPlanar, 7)).toBeNull();
  });

  it("возвращает только периметр без внутренних рёбер тесселяции", () => {
    const face = browserFacePlane(planarMesh, 7);

    expect(face).not.toBeNull();
    expect(browserFaceBoundary(planarMesh, 7, face!.basis)).toHaveLength(4);
  });

  it("не выбирает диагональ тесселяции в качестве оси эскиза", () => {
    const diagonalFirst = { ...planarMesh, indices: [0, 2, 1, 0, 3, 2] };
    const face = browserFacePlane(diagonalFirst, 7);

    expect(face).not.toBeNull();
    expect(Math.abs(face!.basis.u[0] * face!.basis.u[1])).toBeLessThan(1e-9);
  });

  it("возвращает уникальные вершины выбранной грани", () => {
    expect(browserFacePoints(planarMesh, 7)).toEqual([[0, 0, 2], [2, 0, 2], [2, 3, 2], [0, 3, 2]]);
    expect(browserFacePoints(planarMesh, 8)).toEqual([]);
  });
});

describe("browserFacePoints", () => {
  it("берёт уникальные вершины только выбранной грани", () => {
    const mesh = { ...planarMesh, face_triangle_map: [7, 8] };

    expect(browserFacePoints(mesh, 7)).toEqual([[0, 0, 2], [2, 0, 2], [2, 3, 2]]);
    expect(browserFacePoints(planarMesh, 7, 2)).toHaveLength(2);
    expect(browserFacePoints(planarMesh, 9)).toEqual([]);
  });
});
