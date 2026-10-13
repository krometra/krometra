import { describe, it, expect } from "vitest";
import type { SketchEntity } from "@/types/api";
import {
  distanceToLineSegment,
  entitySnapTargets,
  intersectLines,
  isPointNearEntity,
  lineRefOf,
  pairwiseIntersections,
  projectOnLine,
} from "./geometry";

const line = (
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  construction = false
): SketchEntity => ({
  id,
  type: "line",
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
  ...(construction ? { construction: true } : {}),
});

const circle = (id: string, cx: number, cy: number, r: number): SketchEntity => ({
  id,
  type: "circle",
  center: { x: cx, y: cy },
  radius: r,
});

describe("lineRefOf", () => {
  it("возвращает направление обычного отрезка", () => {
    const ref = lineRefOf(line("l", 0, 0, 10, 0), { construction: false });
    expect(ref).not.toBeNull();
    expect(ref!.dir).toEqual({ x: 1, y: 0 });
  });

  it("различает вспомогательные и обычные отрезки", () => {
    const aux = line("a", 0, 0, 0, 5, true);
    expect(lineRefOf(aux, { construction: false })).toBeNull();
    expect(lineRefOf(aux, { construction: true })).not.toBeNull();
  });

  it("бесконечная прямая доступна в любом режиме", () => {
    const inf: SketchEntity = { id: "i", type: "infline", point: { x: 1, y: 2 }, angle: 0 };
    expect(lineRefOf(inf, { construction: true })).not.toBeNull();
    expect(lineRefOf(inf, { construction: false })).not.toBeNull();
  });

  it("вырожденный отрезок отбрасывается", () => {
    expect(lineRefOf(line("z", 3, 3, 3, 3), { construction: false })).toBeNull();
  });
});

describe("intersectLines", () => {
  it("находит точку пересечения", () => {
    const a = lineRefOf(line("a", 0, 0, 10, 0), { construction: false })!;
    const b = lineRefOf(line("b", 4, -5, 4, 5), { construction: false })!;
    expect(intersectLines(a, b)).toEqual({ x: 4, y: 0 });
  });

  it("параллельные прямые не пересекаются", () => {
    const a = lineRefOf(line("a", 0, 0, 10, 0), { construction: false })!;
    const b = lineRefOf(line("b", 0, 7, 10, 7), { construction: false })!;
    expect(intersectLines(a, b)).toBeNull();
  });
});

describe("pairwiseIntersections", () => {
  it("даёт все попарные пересечения", () => {
    const refs = [
      lineRefOf(line("a", 0, 0, 10, 0), { construction: false })!,
      lineRefOf(line("b", 0, 0, 0, 10), { construction: false })!,
      lineRefOf(line("c", 5, -5, 5, 5), { construction: false })!,
    ];
    const pts = pairwiseIntersections(refs);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]);
  });
});

describe("projectOnLine", () => {
  it("проецирует точку на прямую", () => {
    const l = lineRefOf(line("a", 0, 0, 10, 0), { construction: false })!;
    expect(projectOnLine({ x: 3, y: 9 }, l)).toEqual({ x: 3, y: 0 });
  });
});

describe("distanceToLineSegment", () => {
  it("измеряет расстояние до ближайшей точки отрезка, а не прямой", () => {
    expect(distanceToLineSegment({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10);
    expect(distanceToLineSegment({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(4);
  });
});

describe("isPointNearEntity", () => {
  it("ловит попадание по контуру окружности, а не по её центру", () => {
    const c = circle("c", 0, 0, 10);
    expect(isPointNearEntity({ x: 10.5, y: 0 }, c, 1)).toBe(true);
    expect(isPointNearEntity({ x: 0, y: 0 }, c, 1)).toBe(false);
  });

  it("ловит попадание по стороне прямоугольника", () => {
    const rect: SketchEntity = {
      id: "r",
      type: "rectangle",
      corner1: { x: 0, y: 0 },
      corner2: { x: 10, y: 10 },
    };
    expect(isPointNearEntity({ x: 10.5, y: 5 }, rect, 1)).toBe(true);
    expect(isPointNearEntity({ x: 30, y: 5 }, rect, 1)).toBe(false);
  });
});

describe("entitySnapTargets", () => {
  it("включает концы и середину отрезка", () => {
    expect(entitySnapTargets([line("l", 0, 0, 10, 0)])).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
    ]);
  });

  it("включает центр и квадранты окружности", () => {
    const pts = entitySnapTargets([circle("c", 0, 0, 5)]);
    expect(pts).toContainEqual({ x: 0, y: 0 });
    expect(pts).toContainEqual({ x: 5, y: 0 });
    expect(pts).toContainEqual({ x: -5, y: 0 });
    expect(pts).toContainEqual({ x: 0, y: 5 });
    expect(pts).toContainEqual({ x: 0, y: -5 });
  });
});
