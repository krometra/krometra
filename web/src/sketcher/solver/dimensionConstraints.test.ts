import { describe, expect, it } from "vitest";
import { SKETCH_ORIGIN_ID } from "../sketchOrigin";
import { solveSketch, type ConstraintType, type SketchConstraint, type SketchEntity } from "./solveSketch";

const line = (id: string, x1: number, y1: number, x2: number, y2: number): SketchEntity => ({
  id,
  type: "line",
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
});

const at = (entity_id: string, sub_index = 0) => ({ entity_id, sub_index });

let counter = 0;
const constraint = (type: ConstraintType, anchors: ReturnType<typeof at>[], value: number | null = null): SketchConstraint => ({
  id: `c${++counter}`,
  type,
  anchors,
  value,
});

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

const byId = (entities: SketchEntity[], id: string) => entities.find((e) => e.id === id)!;
const lengthOf = (e: SketchEntity) => Math.hypot(e.end!.x - e.start!.x, e.end!.y - e.start!.y);

describe("длина отрезка", () => {
  it("растягивает отрезок до значения, не меняя направления", () => {
    const out = solveSketch([line("l", 0, 0, 10, 0)], [constraint("length", [at("l")], 25)]);
    const l = out.entities[0];
    expect(lengthOf(l)).toBeCloseTo(25, 2);
    expect(l.start!.y).toBeCloseTo(0, 6);
    expect(l.end!.y).toBeCloseTo(0, 6);
    expect(out.residual).toBeLessThan(0.01);
  });

  it("укорачивает наклонный отрезок", () => {
    const out = solveSketch([line("l", 0, 0, 30, 40)], [constraint("length", [at("l")], 10)]);
    const l = out.entities[0];
    expect(lengthOf(l)).toBeCloseTo(10, 2);
    expect((l.end!.y - l.start!.y) / (l.end!.x - l.start!.x)).toBeCloseTo(4 / 3, 4);
  });
});

describe("диаметр", () => {
  it("задаёт радиус половиной значения", () => {
    const out = solveSketch(
      [{ id: "c", type: "circle", center: { x: 3, y: 4 }, radius: 5 }],
      [constraint("diameter", [at("c")], 56.5)],
    );
    expect(out.entities[0].radius).toBeCloseTo(28.25, 2);
    expect(out.residual).toBeLessThan(0.01);
  });

  it("работает и для дуги", () => {
    const out = solveSketch(
      [{ id: "a", type: "arc", center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI / 2 }],
      [constraint("diameter", [at("a")], 30)],
    );
    expect(out.entities[0].radius).toBeCloseTo(15, 2);
  });
});

describe("расстояние между параллельными отрезками", () => {
  it("раздвигает горизонтальные отрезки, сохраняя сторону", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 0, 5, 10, 5)],
      [constraint("horizontal", [at("a")]), constraint("horizontal", [at("b")]), constraint("line_distance", [at("a"), at("b")], 20)],
    );
    const a = byId(out.entities, "a");
    const b = byId(out.entities, "b");
    expect(b.start!.y - a.start!.y).toBeCloseTo(20, 2);
    expect(b.end!.y - a.end!.y).toBeCloseTo(20, 2);
    expect(out.residual).toBeLessThan(0.01);
  });

  it("отрезок ниже базового остаётся ниже", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 10, -3, 0, -3)],
      [constraint("line_distance", [at("a"), at("b")], 12)],
    );
    const a = byId(out.entities, "a");
    const b = byId(out.entities, "b");
    expect(a.start!.y - b.start!.y).toBeCloseTo(12, 2);
  });

  it("расстояние между сторонами двух прямоугольников: прямоугольники не теряют форму", () => {
    const left = rectangle("A", -40, -10, -10, 10);
    const right = rectangle("B", 0, -15, 25, 15);
    const out = solveSketch(
      [...left.entities, ...right.entities],
      [...left.constraints, ...right.constraints, constraint("line_distance", [at("A-right"), at("B-left")], 20)],
    );
    const aRight = byId(out.entities, "A-right");
    const bLeft = byId(out.entities, "B-left");
    expect(bLeft.start!.x - aRight.start!.x).toBeCloseTo(20, 1);
    const aBottom = byId(out.entities, "A-bottom");
    const bTop = byId(out.entities, "B-top");
    expect(aBottom.end!.x).toBeCloseTo(aRight.start!.x, 1);
    expect(aBottom.end!.y).toBeCloseTo(aBottom.start!.y, 2);
    expect(bTop.start!.x).toBeCloseTo(byId(out.entities, "B-right").end!.x, 1);
    expect(bTop.end!.y).toBeCloseTo(bTop.start!.y, 2);
    expect(out.residual).toBeLessThan(0.05);
  });
});

describe("перпендикулярное расстояние от точки до линии", () => {
  it("сдвигает точку и линию по нормали", () => {
    const out = solveSketch(
      [line("base", 0, 0, 10, 0), line("p", 3, 4, 3, 30)],
      [constraint("horizontal", [at("base")]), constraint("point_line_distance", [at("p", 0), at("base")], 15)],
    );
    const base = byId(out.entities, "base");
    const p = byId(out.entities, "p");
    expect(p.start!.y - base.start!.y).toBeCloseTo(15, 2);
    expect(p.start!.x).toBeCloseTo(3, 6);
  });

  it("начало координат не двигается, линия встаёт на расстояние от него", () => {
    const out = solveSketch(
      [line("l", -5, 3, 5, 3)],
      [constraint("horizontal", [at("l")]), constraint("point_line_distance", [at(SKETCH_ORIGIN_ID), at("l")], 12)],
    );
    const l = out.entities[0];
    expect(l.start!.y).toBeCloseTo(12, 2);
    expect(l.end!.y).toBeCloseTo(12, 2);
    expect(out.residual).toBeLessThan(0.01);
  });

  it("центр окружности как точка", () => {
    const out = solveSketch(
      [line("l", 0, 0, 10, 0), { id: "c", type: "circle", center: { x: 5, y: -2 }, radius: 3 }],
      [constraint("horizontal", [at("l")]), constraint("point_line_distance", [at("c", 0), at("l")], 8)],
    );
    const l = byId(out.entities, "l");
    const c = byId(out.entities, "c");
    expect(l.start!.y - c.center!.y).toBeCloseTo(8, 2);
    expect(c.radius).toBeCloseTo(3, 6);
  });

  it("конец того же отрезка не двигается", () => {
    const out = solveSketch([line("l", 0, 0, 10, 0)], [constraint("point_line_distance", [at("l", 1), at("l")], 5)]);
    expect(out.entities[0].end).toEqual({ x: 10, y: 0 });
  });
});

describe("горизонтальный и вертикальный размер между точками", () => {
  it("горизонтальный задаёт dx и не трогает dy", () => {
    const out = solveSketch(
      [line("a", 0, 0, 0, 10), line("b", 5, 3, 5, 20)],
      [constraint("horizontal_distance", [at("a", 0), at("b", 0)], 20)],
    );
    const a = byId(out.entities, "a");
    const b = byId(out.entities, "b");
    expect(b.start!.x - a.start!.x).toBeCloseTo(20, 2);
    expect(b.start!.y - a.start!.y).toBeCloseTo(3, 6);
  });

  it("знак берётся из положения точек", () => {
    const out = solveSketch(
      [line("a", 10, 0, 10, 10), line("b", 4, 0, 4, 10)],
      [constraint("horizontal_distance", [at("a", 0), at("b", 0)], 20)],
    );
    expect(byId(out.entities, "b").start!.x - byId(out.entities, "a").start!.x).toBeCloseTo(-20, 2);
  });

  it("вертикальный от начала координат", () => {
    const out = solveSketch(
      [line("a", 7, 2, 20, 2)],
      [constraint("vertical_distance", [at(SKETCH_ORIGIN_ID), at("a", 0)], 9)],
    );
    expect(out.entities[0].start!.y).toBeCloseTo(9, 2);
    expect(out.entities[0].start!.x).toBeCloseTo(7, 6);
  });
});

describe("угол с выбранными лучами", () => {
  const rayAngle = (from: { x: number; y: number }, to: { x: number; y: number }) => Math.atan2(to.y - from.y, to.x - from.x);

  it("луч второго отрезка от конца к началу", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 10, 10, 0, 1)],
      [constraint("angle", [at("a", 0), at("b", 1)], 75)],
    );
    const a = byId(out.entities, "a");
    const b = byId(out.entities, "b");
    const angle = rayAngle(b.end!, b.start!) - rayAngle(a.start!, a.end!);
    expect((angle * 180) / Math.PI).toBeCloseTo(75, 1);
    expect(b.end).toEqual({ x: 0, y: 1 });
  });

  it("старый угол без выбора луча считается как раньше", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 0, 0, 10, 2)],
      [constraint("angle", [at("a"), at("b")], 30)],
    );
    const b = byId(out.entities, "b");
    expect((rayAngle(b.start!, b.end!) * 180) / Math.PI).toBeCloseTo(30, 1);
  });
});

describe("старое расстояние между точками", () => {
  it("по-прежнему меряет между указанными точками", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 13, 4, 20, 4)],
      [constraint("distance", [at("a", 1), at("b", 0)], 10)],
    );
    const a = byId(out.entities, "a");
    const b = byId(out.entities, "b");
    expect(Math.hypot(b.start!.x - a.end!.x, b.start!.y - a.end!.y)).toBeCloseTo(10, 2);
  });
});
