import { describe, it, expect } from "vitest";
import { solveSketch, type SketchConstraint, type SketchEntity } from "./solveSketch";

const circle = (id: string, r: number): SketchEntity => ({
  id,
  type: "circle",
  center: { x: 0, y: 0 },
  radius: r,
});

const radiusConstraint = (entityId: string, value: number): SketchConstraint => ({
  id: `c-${entityId}`,
  type: "radius",
  anchors: [{ entity_id: entityId, sub_index: 0 }],
  value,
});

describe("solveSketch", () => {
  it("без ограничений возвращает геометрию как есть", () => {
    const out = solveSketch([circle("a", 6)], []);
    expect(out.converged).toBe(true);
    expect(out.entities[0].radius).toBe(6);
  });

  it("ограничение радиуса приводит окружность к заданному значению", () => {
    const out = solveSketch([circle("a", 6)], [radiusConstraint("a", 25)]);
    expect(out.entities[0].radius).toBeCloseTo(25, 1);
    expect(out.residual).toBeLessThan(0.1);
  });

  it("уменьшение радиуса тоже работает", () => {
    const out = solveSketch([circle("a", 60)], [radiusConstraint("a", 4)]);
    expect(out.entities[0].radius).toBeCloseTo(4, 1);
  });

  it("правит только окружность со ссылкой в ограничении", () => {
    const out = solveSketch([circle("a", 6), circle("b", 60)], [radiusConstraint("b", 25)]);
    expect(out.entities[0].radius).toBeCloseTo(6, 3);
    expect(out.entities[1].radius).toBeCloseTo(25, 1);
  });

  it("горизонтальность выравнивает концы отрезка", () => {
    const line: SketchEntity = {
      id: "l",
      type: "line",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 4 },
    };
    const out = solveSketch([line], [
      { id: "c", type: "horizontal", anchors: [{ entity_id: "l", sub_index: 0 }], value: null },
    ]);
    expect(out.entities[0].start!.y).toBeCloseTo(out.entities[0].end!.y, 6);
  });

  it("ограничение расстояния разводит точки на заданную длину", () => {
    const a: SketchEntity = { id: "a", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } };
    const b: SketchEntity = { id: "b", type: "line", start: { x: 5, y: 0 }, end: { x: 6, y: 0 } };
    const out = solveSketch([a, b], [
      {
        id: "d",
        type: "distance",
        anchors: [
          { entity_id: "a", sub_index: 0 },
          { entity_id: "b", sub_index: 0 },
        ],
        value: 20,
      },
    ]);
    const p0 = out.entities[0].start!;
    const p1 = out.entities[1].start!;
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeCloseTo(20, 1);
  });
});
