import { describe, expect, it } from "vitest";
import { angleBetween, axisDistance, centerDistance, measuredPair, type MeasuredEdge, type MeasuredFace, type MeasuredItem } from "./measure";

function plane(normal: [number, number, number]): MeasuredFace {
  return { kind: "face", surface: "plane", area: 1, centroid: [0, 0, 0], normal, radius: null, center: null, axis: null };
}

function cylinder(origin: [number, number, number], direction: [number, number, number], radius = 2): MeasuredFace {
  return { kind: "face", surface: "cylinder", area: 1, centroid: origin, normal: null, radius, center: null, axis: { origin, direction } };
}

function line(direction: [number, number, number]): MeasuredEdge {
  return {
    kind: "edge", curve: "line", length: 1, start: [0, 0, 0], end: direction, closed: false,
    direction, radius: null, center: null, axis: null,
  };
}

function circle(center: [number, number, number], direction: [number, number, number] = [0, 0, 1]): MeasuredEdge {
  return {
    kind: "edge", curve: "circle", length: 1, start: center, end: center, closed: true,
    direction: null, radius: 1, center, axis: { origin: center, direction },
  };
}

const vertex = (point: [number, number, number]): MeasuredItem => ({ kind: "vertex", point });

describe("angleBetween", () => {
  it("между плоскостями — острый угол между нормалями", () => {
    expect(angleBetween(plane([0, 0, 1]), plane([1, 0, 0]))).toBeCloseTo(90);
    expect(angleBetween(plane([0, 0, 1]), plane([0, 0, -1]))).toBeCloseTo(0);
    expect(angleBetween(plane([0, 0, 1]), plane([0, 1, 1]))).toBeCloseTo(45);
  });

  it("между прямыми не зависит от направления обхода", () => {
    expect(angleBetween(line([1, 0, 0]), line([-1, 1, 0]))).toBeCloseTo(45);
  });

  it("между прямой и плоскостью — угол к самой плоскости, а не к нормали", () => {
    expect(angleBetween(line([0, 0, 1]), plane([0, 0, 1]))).toBeCloseTo(90);
    expect(angleBetween(plane([0, 0, 1]), line([1, 0, 0]))).toBeCloseTo(0);
  });

  it("ось цилиндра считается прямой", () => {
    expect(angleBetween(cylinder([0, 0, 0], [0, 0, 1]), plane([0, 0, 1]))).toBeCloseTo(90);
  });

  it("у вершины и тела угла нет", () => {
    expect(angleBetween(vertex([0, 0, 0]), plane([0, 0, 1]))).toBeNull();
  });
});

describe("axisDistance", () => {
  it("межосевое расстояние параллельных отверстий", () => {
    expect(axisDistance(cylinder([0, 0, 0], [0, 0, 1]), cylinder([3, 4, 7], [0, 0, -1]))).toBeCloseTo(5);
  });

  it("окружность кромки даёт ось так же, как цилиндр", () => {
    expect(axisDistance(circle([0, 0, 5]), cylinder([10, 0, 0], [0, 0, 1]))).toBeCloseTo(10);
  });

  it("непараллельные оси не дают межосевого", () => {
    expect(axisDistance(cylinder([0, 0, 0], [0, 0, 1]), cylinder([5, 0, 0], [1, 0, 0]))).toBeNull();
  });
});

describe("centerDistance", () => {
  it("между центрами окружностей и от центра до вершины", () => {
    expect(centerDistance(circle([0, 0, 0]), circle([0, 0, 12]))).toBeCloseTo(12);
    expect(centerDistance(circle([0, 0, 0]), vertex([3, 4, 0]))).toBeCloseTo(5);
  });

  it("у двух вершин это и есть расстояние — отдельно не повторяется", () => {
    expect(centerDistance(vertex([0, 0, 0]), vertex([1, 0, 0]))).toBeNull();
  });
});

describe("measuredPair", () => {
  it("раскладывает отрезок-размер на проекции по осям", () => {
    const pair = measuredPair(plane([0, 0, 1]), plane([0, 0, -1]), 5, [[1, 1, 0], [1, 1, 5]]);
    expect(pair.delta).toEqual([0, 0, 5]);
    expect(pair.angle).toBeCloseTo(0);
    expect(pair.axisDistance).toBeNull();
  });
});
