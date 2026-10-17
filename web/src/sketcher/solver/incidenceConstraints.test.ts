import { describe, expect, it } from "vitest";
import { WHOLE_ENTITY } from "./fixConstraint";
import { solveSketch, type SketchConstraint, type SketchEntity } from "./solveSketch";

const line = (id: string, x1: number, y1: number, x2: number, y2: number): SketchEntity => ({
  id,
  type: "line",
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
});

const circle = (id: string, x: number, y: number, radius: number): SketchEntity => ({
  id,
  type: "circle",
  center: { x, y },
  radius,
});

const arc = (id: string, x: number, y: number, radius: number, startAngle: number, endAngle: number): SketchEntity => ({
  id,
  type: "arc",
  center: { x, y },
  radius,
  startAngle,
  endAngle,
});

const at = (entity_id: string, sub_index = 0) => ({ entity_id, sub_index });

let counter = 0;
const constraint = (type: SketchConstraint["type"], anchors: { entity_id: string; sub_index: number }[]): SketchConstraint => ({
  id: `c${++counter}`,
  type,
  anchors,
  value: null,
});

const byId = (entities: SketchEntity[], id: string) => entities.find((e) => e.id === id)!;

const distanceToLine = (p: { x: number; y: number }, l: SketchEntity) => {
  const dx = l.end!.x - l.start!.x;
  const dy = l.end!.y - l.start!.y;
  return Math.abs((p.x - l.start!.x) * dy - (p.y - l.start!.y) * dx) / Math.hypot(dx, dy);
};

describe("коллинеарность", () => {
  it("ставит два отрезка на одну прямую", () => {
    const out = solveSketch([line("a", 0, 0, 10, 0), line("b", 15, 4, 25, 5)], [constraint("collinear", [at("a"), at("b")])]);
    const a = byId(out.entities, "a");
    const b = byId(out.entities, "b");
    expect(distanceToLine(b.start!, a)).toBeLessThan(1e-3);
    expect(distanceToLine(b.end!, a)).toBeLessThan(1e-3);
    expect(out.residual).toBeLessThan(1e-3);
  });

  it("закреплённый отрезок остаётся на месте, второй встаёт на его продолжение", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 15, 4, 25, 4)],
      [constraint("fix", [at("a", WHOLE_ENTITY)]), constraint("collinear", [at("a"), at("b")])],
    );
    const a = byId(out.entities, "a");
    const b = byId(out.entities, "b");
    expect(a.start).toEqual({ x: 0, y: 0 });
    expect(a.end).toEqual({ x: 10, y: 0 });
    expect(b.start!.y).toBeCloseTo(0, 2);
    expect(b.end!.y).toBeCloseTo(0, 2);
    expect(b.start!.x).toBeCloseTo(15, 2);
  });
});

describe("середина", () => {
  it("конец одного отрезка встаёт в середину другого", () => {
    const out = solveSketch([line("a", 0, 0, 10, 0), line("b", 3, 2, 3, 12)], [constraint("midpoint", [at("b", 0), at("a")])]);
    const a = byId(out.entities, "a");
    const b = byId(out.entities, "b");
    expect(b.start!.x).toBeCloseTo((a.start!.x + a.end!.x) / 2, 2);
    expect(b.start!.y).toBeCloseTo((a.start!.y + a.end!.y) / 2, 2);
    expect(out.residual).toBeLessThan(1e-3);
  });

  it("центр окружности в середине отрезка, радиус не меняется", () => {
    const out = solveSketch([line("a", 0, 0, 20, 0), circle("c", 4, 6, 3)], [constraint("midpoint", [at("c", 0), at("a")])]);
    const a = byId(out.entities, "a");
    const c = byId(out.entities, "c");
    expect(c.center!.x).toBeCloseTo((a.start!.x + a.end!.x) / 2, 2);
    expect(c.center!.y).toBeCloseTo((a.start!.y + a.end!.y) / 2, 2);
    expect(c.radius).toBeCloseTo(3, 6);
  });

  it("середина отрезка в начале координат: отрезок центрируется", () => {
    const out = solveSketch([line("a", 2, 3, 12, 3)], [constraint("midpoint", [at("sketch-origin", 0), at("a")])]);
    const a = byId(out.entities, "a");
    expect((a.start!.x + a.end!.x) / 2).toBeCloseTo(0, 2);
    expect((a.start!.y + a.end!.y) / 2).toBeCloseTo(0, 2);
    expect(Math.hypot(a.end!.x - a.start!.x, a.end!.y - a.start!.y)).toBeCloseTo(10, 6);
  });

  it("собственный конец отрезка не тянется к его середине", () => {
    const out = solveSketch([line("a", 0, 0, 10, 0)], [constraint("midpoint", [at("a", 0), at("a")])]);
    expect(byId(out.entities, "a").start).toEqual({ x: 0, y: 0 });
  });
});

describe("точка на кривой", () => {
  it("точка встаёт на продолжение отрезка", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 30, 5, 30, 20)],
      [constraint("fix", [at("a", WHOLE_ENTITY)]), constraint("point_on_curve", [at("b", 0), at("a")])],
    );
    const b = byId(out.entities, "b");
    expect(b.start!.y).toBeCloseTo(0, 2);
    expect(b.start!.x).toBeCloseTo(30, 2);
    expect(out.residual).toBeLessThan(1e-3);
  });

  it("центр окружности на прямой, радиус не меняется", () => {
    const out = solveSketch([line("a", 0, 0, 10, 10), circle("c", 8, 0, 2)], [constraint("point_on_curve", [at("c", 0), at("a")])]);
    const a = byId(out.entities, "a");
    const c = byId(out.entities, "c");
    expect(distanceToLine(c.center!, a)).toBeLessThan(1e-3);
    expect(c.radius).toBeCloseTo(2, 6);
  });

  it("угол прямоугольника на окружности", () => {
    const out = solveSketch(
      [circle("c", 0, 0, 10), line("side", 3, 3, 3, -3)],
      [constraint("fix", [at("c", WHOLE_ENTITY)]), constraint("point_on_curve", [at("side", 0), at("c")])],
    );
    const side = byId(out.entities, "side");
    const c = byId(out.entities, "c");
    expect(Math.hypot(side.start!.x, side.start!.y)).toBeCloseTo(10, 2);
    expect(c.radius).toBe(10);
    expect(c.center).toEqual({ x: 0, y: 0 });
  });

  it("незакреплённая окружность и точка сходятся навстречу", () => {
    const out = solveSketch([circle("c", 0, 0, 10), line("l", 20, 0, 30, 0)], [constraint("point_on_curve", [at("l", 0), at("c")])]);
    const l = byId(out.entities, "l");
    const c = byId(out.entities, "c");
    expect(Math.hypot(l.start!.x - c.center!.x, l.start!.y - c.center!.y)).toBeCloseTo(c.radius!, 2);
    expect(out.residual).toBeLessThan(1e-3);
  });

  it("точка на дуге: держится окружности дуги", () => {
    const out = solveSketch(
      [arc("r", 0, 0, 5, 0, Math.PI / 2), line("l", 1, 1, 9, 9)],
      [constraint("fix", [at("r", WHOLE_ENTITY)]), constraint("point_on_curve", [at("l", 0), at("r")])],
    );
    const l = byId(out.entities, "l");
    expect(Math.hypot(l.start!.x, l.start!.y)).toBeCloseTo(5, 2);
    expect(byId(out.entities, "r").radius).toBe(5);
  });

  it("конец дуги на своей же дуге ничего не двигает", () => {
    const entities = [arc("r", 0, 0, 5, 0, Math.PI / 2)];
    const out = solveSketch(entities, [constraint("point_on_curve", [at("r", 1), at("r")])]);
    expect(byId(out.entities, "r").radius).toBeCloseTo(5, 9);
    expect(out.residual).toBe(0);
  });
});

describe("закрепление", () => {
  it("закреплённая точка не двигается, ограничение двигает второй конец", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 12, 3, 20, 3)],
      [constraint("fix", [at("a", 1)]), constraint("coincident", [at("a", 1), at("b", 0)])],
    );
    const a = byId(out.entities, "a");
    const b = byId(out.entities, "b");
    expect(a.end).toEqual({ x: 10, y: 0 });
    expect(b.start!.x).toBeCloseTo(10, 2);
    expect(b.start!.y).toBeCloseTo(0, 2);
  });

  it("закреплённая окружность целиком: ни центр, ни радиус не меняются", () => {
    const out = solveSketch(
      [circle("c", 5, 5, 4), circle("d", 0, 0, 8)],
      [constraint("fix", [at("c", WHOLE_ENTITY)]), constraint("equal", [at("c"), at("d")])],
    );
    const c = byId(out.entities, "c");
    expect(c.center).toEqual({ x: 5, y: 5 });
    expect(c.radius).toBeCloseTo(4, 6);
    expect(byId(out.entities, "d").radius).toBeCloseTo(4, 2);
  });

  it("закреплённый центр окружности держит её на месте, но не радиус", () => {
    const out = solveSketch(
      [circle("c", 5, 5, 4), line("l", 20, 0, 30, 0)],
      [constraint("fix", [at("c", 0)]), constraint("point_on_curve", [at("l", 0), at("c")])],
    );
    const c = byId(out.entities, "c");
    const l = byId(out.entities, "l");
    expect(c.center).toEqual({ x: 5, y: 5 });
    expect(Math.hypot(l.start!.x - 5, l.start!.y - 5)).toBeCloseTo(c.radius!, 2);
  });

  it("одно закрепление без других ограничений ничего не меняет", () => {
    const entities = [line("a", 1, 2, 3, 4)];
    const out = solveSketch(entities, [constraint("fix", [at("a", WHOLE_ENTITY)])]);
    expect(out.entities).toEqual(entities);
    expect(out.converged).toBe(true);
  });
});

describe("совпадение с центром окружности", () => {
  it("переносит окружность целиком, не меняя радиус", () => {
    const out = solveSketch([line("l", 0, 0, 10, 0), circle("c", 14, 3, 2)], [constraint("coincident", [at("l", 1), at("c", 0)])]);
    const l = byId(out.entities, "l");
    const c = byId(out.entities, "c");
    expect(c.center!.x).toBeCloseTo(l.end!.x, 2);
    expect(c.center!.y).toBeCloseTo(l.end!.y, 2);
    expect(c.radius).toBeCloseTo(2, 6);
  });
});
