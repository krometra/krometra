import { describe, expect, it } from "vitest";
import { closestOnTriangle, filterTopology, findFaces } from "./faceSearch";
import { describeBodyTopology } from "./topology";
import { C, boxMesh } from "./topologyFixtures";

const topology = () => describeBodyTopology("body-1", boxMesh());

describe("filterTopology", () => {
  it("оставляет только грани с нужной нормалью и их рёбра", () => {
    const result = filterTopology(topology(), { normal: [0, 0, 2] });
    expect(result.faces.map((face) => face.id)).toEqual(["top"]);
    expect(result.edges.every((edge) => result.faces[0].edgeIds.includes(edge.id))).toBe(true);
  });

  it("include = faces убирает рёбра, include = edges — грани", () => {
    expect(filterTopology(topology(), { include: "faces" }).edges).toEqual([]);
    expect(filterTopology(topology(), { include: "edges" }).faces).toEqual([]);
  });

  it("planar = false отбирает неплоские грани", () => {
    expect(filterTopology(topology(), { planar: false }).faces).toEqual([]);
  });
});

describe("findFaces", () => {
  it("ближайшая к точке грань идёт первой", () => {
    const [nearest] = findFaces(topology(), boxMesh(), { point: [5, 3, C + 1], limit: 3 });
    expect(nearest.id).toBe("top");
    expect(nearest.distance).toBeCloseTo(1, 6);
  });

  it("без точки сортирует по площади и учитывает нормаль", () => {
    const found = findFaces(topology(), boxMesh(), { normal: [0, -1, 0], limit: 5 });
    expect(found.map((face) => face.id)).toEqual(["front"]);
    expect(found[0].distance).toBeNull();
  });
});

describe("closestOnTriangle", () => {
  it("проецирует точку внутрь треугольника и на ребро", () => {
    expect(closestOnTriangle([1, 1, 5], [0, 0, 0], [4, 0, 0], [0, 4, 0])).toEqual([1, 1, 0]);
    expect(closestOnTriangle([2, -3, 0], [0, 0, 0], [4, 0, 0], [0, 4, 0])).toEqual([2, 0, 0]);
  });
});
