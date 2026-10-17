import { describe, expect, it } from "vitest";
import { SKETCH_AXIS_IDS, SKETCH_ORIGIN_ID } from "../sketchOrigin";
import { LINE_MIDPOINT } from "../sketchPoints";
import { solveSketch, type ConstraintType, type SketchConstraint, type SketchEntity } from "./solveSketch";

const line = (id: string, x1: number, y1: number, x2: number, y2: number, construction = false): SketchEntity =>
  ({ id, type: "line", start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, ...(construction ? { construction } : {}) }) as SketchEntity;

const at = (entity_id: string, sub_index = 0) => ({ entity_id, sub_index });

let counter = 0;
const constraint = (type: ConstraintType, anchors: ReturnType<typeof at>[], value: number | null = null): SketchConstraint => ({
  id: `c${++counter}`,
  type,
  anchors,
  value,
});

const find = (entities: SketchEntity[], id: string) => entities.find((e) => e.id === id)!;

function rectangle(prefix: string, x1: number, y1: number, x2: number, y2: number) {
  const corners = [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
  const ids = ["bottom", "right", "top", "left"].map((side) => `${prefix}-${side}`);
  const entities = corners.map((start, i) => line(ids[i], start.x, start.y, corners[(i + 1) % 4].x, corners[(i + 1) % 4].y));
  const constraints = [
    constraint("horizontal", [at(ids[0])]),
    constraint("horizontal", [at(ids[2])]),
    constraint("vertical", [at(ids[1])]),
    constraint("vertical", [at(ids[3])]),
    ...ids.map((id, i) => constraint("coincident", [at(id, 1), at(ids[(i + 1) % 4], 0)])),
  ];
  return { entities, constraints, ids };
}

describe("решатель: середина отрезка как точка", () => {
  it("совпадение середины отрезка с началом координат сдвигает отрезок, не меняя длины", () => {
    const result = solveSketch([line("l", 10, 5, 30, 5)], [constraint("coincident", [at("l", LINE_MIDPOINT), at(SKETCH_ORIGIN_ID)])]);
    const l = find(result.entities, "l");
    expect(result.converged).toBe(true);
    expect(l.start!.x).toBeCloseTo(-10, 2);
    expect(l.end!.x).toBeCloseTo(10, 2);
    expect(l.start!.y).toBeCloseTo(0, 2);
    expect(l.end!.y).toBeCloseTo(0, 2);
  });

  it("прямоугольник центрируется на начале координат серединами сторон", () => {
    const { entities, constraints, ids } = rectangle("r", 5, 5, 45, 25);
    const result = solveSketch(entities, [
      ...constraints,
      constraint("vertical", [at(ids[0], LINE_MIDPOINT), at(SKETCH_ORIGIN_ID)]),
      constraint("horizontal", [at(ids[1], LINE_MIDPOINT), at(SKETCH_ORIGIN_ID)]),
    ]);
    const bottom = find(result.entities, ids[0]);
    const right = find(result.entities, ids[1]);
    expect((bottom.start!.x + bottom.end!.x) / 2).toBeCloseTo(0, 1);
    expect((right.start!.y + right.end!.y) / 2).toBeCloseTo(0, 1);
    expect(Math.abs(bottom.end!.x - bottom.start!.x)).toBeCloseTo(40, 1);
  });

  it("размер от середины отрезка до точки", () => {
    const result = solveSketch(
      [line("a", 0, 0, 20, 0), line("b", 50, 10, 50, 30)],
      [constraint("horizontal_distance", [at("a", LINE_MIDPOINT), at("b", 0)], 25)],
    );
    const a = find(result.entities, "a");
    const b = find(result.entities, "b");
    expect(b.start!.x - (a.start!.x + a.end!.x) / 2).toBeCloseTo(25, 2);
    expect(a.end!.x - a.start!.x).toBeCloseTo(20, 4);
  });
});

describe("решатель: горизонталь и вертикаль двух точек", () => {
  it("концы разных отрезков выравниваются по Y", () => {
    const result = solveSketch(
      [line("a", 0, 0, 10, 4), line("b", 20, 10, 30, 12)],
      [constraint("horizontal", [at("a", 1), at("b", 0)])],
    );
    expect(find(result.entities, "a").end!.y).toBeCloseTo(find(result.entities, "b").start!.y, 3);
    expect(result.residual).toBeLessThan(0.01);
  });

  it("точка встаёт на вертикаль через начало координат, начало не двигается", () => {
    const result = solveSketch([line("a", 7, 3, 20, 3)], [constraint("vertical", [at("a", 0), at(SKETCH_ORIGIN_ID)])]);
    expect(find(result.entities, "a").start!.x).toBeCloseTo(0, 2);
  });
});

describe("решатель: оси, бесконечные прямые и рёбра грани", () => {
  it("отрезок становится параллельным оси Y, ось остаётся на месте", () => {
    const result = solveSketch([line("a", 0, 0, 3, 40)], [constraint("parallel", [at("a"), at(SKETCH_AXIS_IDS.y)])]);
    const a = find(result.entities, "a");
    expect(a.end!.x - a.start!.x).toBeCloseTo(0, 1);
  });

  it("расстояние от точки до оси X", () => {
    const result = solveSketch(
      [line("a", 5, 12, 25, 12)],
      [constraint("horizontal", [at("a")]), constraint("point_line_distance", [at("a", 0), at(SKETCH_AXIS_IDS.x)], 30)],
    );
    expect(find(result.entities, "a").start!.y).toBeCloseTo(30, 2);
  });

  it("бесконечная прямая поворачивается ограничением перпендикулярности", () => {
    const infline: SketchEntity = { id: "i", type: "infline", point: { x: 0, y: 10 }, angle: 0.2 };
    const result = solveSketch([infline, line("a", 0, 0, 40, 0)], [
      constraint("horizontal", [at("a")]),
      constraint("perpendicular", [at("i"), at("a")]),
    ]);
    const solved = find(result.entities, "i");
    expect(Math.abs(Math.cos(solved.angle!))).toBeLessThan(0.01);
  });

  it("ребро грани неподвижно: размер от него двигает только эскиз", () => {
    const edge = line("face-edge-3-7", -50, 0, 50, 0, true);
    const side = line("s", -20, 12, 20, 12);
    const result = solveSketch([edge, side], [
      constraint("horizontal", [at("s")]),
      constraint("line_distance", [at("face-edge-3-7"), at("s")], 10),
    ]);
    const solvedEdge = find(result.entities, "face-edge-3-7");
    expect(solvedEdge.start).toEqual({ x: -50, y: 0 });
    expect(solvedEdge.end).toEqual({ x: 50, y: 0 });
    expect(find(result.entities, "s").start!.y).toBeCloseTo(10, 2);
  });

  it("радиус окружности-ребра грани не меняется ограничением равенства", () => {
    const hole: SketchEntity = { id: "face-edge-3-9", type: "circle", center: { x: 0, y: 0 }, radius: 10 };
    const drawn: SketchEntity = { id: "c", type: "circle", center: { x: 40, y: 0 }, radius: 4 };
    const result = solveSketch([hole, drawn], [constraint("equal", [at("face-edge-3-9"), at("c")])]);
    expect(find(result.entities, "face-edge-3-9").radius).toBe(10);
    expect(find(result.entities, "c").radius).toBeCloseTo(10, 2);
  });
});
