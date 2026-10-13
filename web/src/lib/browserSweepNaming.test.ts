import { describe, expect, it } from "vitest";
import { rotatePoint, sweepGeneratedFaces, sweepPoint, sweepProbes, worldProbes } from "./browserSweepNaming";

describe("sweepProbes", () => {
  it("даёт точку внутри каждого сегмента профиля с ключом сущности эскиза", () => {
    const probes = sweepProbes([
      { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
      { id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 2 },
      { id: "r", type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 2, y: 4 } },
      { id: "cl", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, construction: true },
    ]);

    expect(probes.map((probe) => probe.key)).toEqual(["l", "c", "c.1", "r.0", "r.1", "r.2", "r.3"]);
    expect(probes[0].point).toEqual({ x: 2, y: 0 });
    expect(probes[1].point.y).toBeCloseTo(2);
    expect(probes[4].point).toEqual({ x: 2, y: 2 });
  });
});

describe("траектория протяжки", () => {
  it("сдвигает точку вдоль призмы и вращает вокруг оси", () => {
    expect(sweepPoint([1, 0, 0], { kind: "prism", direction: [0, 0, 1], length: 10 }, 0.5)).toEqual([1, 0, 5]);
    const rotated = rotatePoint([1, 0, 0], [0, 0, 0], [0, 0, 1], 90);
    expect(rotated[0]).toBeCloseTo(0);
    expect(rotated[1]).toBeCloseTo(1);
  });

  it("строит мировые точки от плоскости эскиза с учётом центра профиля", () => {
    const [probe] = worldProbes(
      [{ key: "a", point: { x: 3, y: 1 } }],
      { origin: [0, 0, 5], u: [1, 0, 0], v: [0, 1, 0] },
      { x: 1, y: 1 },
      { kind: "prism", direction: [0, 0, -1], length: 4 },
    );
    expect(probe).toEqual({ key: "a", start: [2, 0, 5], middle: [2, 0, 3], end: [2, 0, 1] });
  });
});

describe("sweepGeneratedFaces", () => {
  it("называет боковые грани по сегменту, а торцы — по наименьшему ключу контура", () => {
    const generated = sweepGeneratedFaces(5, [
      { key: "b", start: [3], middle: [1], end: [4] },
      { key: "a", start: [3], middle: [0, 2], end: [4] },
    ]);

    expect(generated).toEqual([
      { key: "side:a", images: [0, 2] },
      { key: "side:b", images: [1] },
      { key: "start:a", images: [3] },
      { key: "end:a", images: [4] },
    ]);
  });
});
