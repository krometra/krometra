import { describe, expect, it } from "vitest";
import { brepEdgeCoordinates, isClosedPolyline, polylineCoordinates, polylineLength } from "./brepEdge";

const positions = [0, 0, 0, 10, 0, 0, 10, 5, 0];

describe("brepEdgeCoordinates", () => {
  it("берёт тесселированную кривую, когда она есть", () => {
    const edge = { edge_id: "e", vertices: [0], polyline: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
    expect(brepEdgeCoordinates(positions, edge)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
  });

  it("без кривой собирает точки по индексам вершин меша", () => {
    expect(brepEdgeCoordinates(positions, { edge_id: 1, vertices: [0, 2] })).toEqual([
      [0, 0, 0],
      [10, 5, 0],
    ]);
  });

  it("кривая из одной точки не считается кривой", () => {
    expect(brepEdgeCoordinates(positions, { edge_id: 1, vertices: [1, 2], polyline: [9, 9, 9] })).toEqual([
      [10, 0, 0],
      [10, 5, 0],
    ]);
  });

  it("пропускает индексы за пределами меша", () => {
    expect(brepEdgeCoordinates(positions, { edge_id: 1, vertices: [1, 42] })).toEqual([[10, 0, 0]]);
  });
});

describe("ломаная ребра", () => {
  it("плоский массив координат разбирается в точки, хвост без полной точки отбрасывается", () => {
    expect(polylineCoordinates([1, 2, 3, 4, 5, 6, 7])).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it("длина — сумма звеньев, повторы точек её не меняют", () => {
    expect(polylineLength([[0, 0, 0], [3, 0, 0], [3, 0, 0], [3, 4, 0]])).toBe(7);
    expect(polylineLength([[1, 1, 1]])).toBe(0);
  });

  it("замкнута, когда конец совпал с началом, а точек больше двух", () => {
    expect(isClosedPolyline([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 0, 0]])).toBe(true);
    expect(isClosedPolyline([[0, 0, 0], [1, 0, 0], [1, 1, 0]])).toBe(false);
    expect(isClosedPolyline([[0, 0, 0], [0, 0, 0]])).toBe(false);
  });
});
