import { describe, it, expect } from "vitest";
import { solveSketch, type SketchConstraint, type SketchEntity } from "./solveSketch";

/**
 * Покрытие оставшихся типов ограничений (ROADMAP P3 п.10: solver — ~600 строк
 * чистой математики, идеальный кандидат под vitest).
 *
 * `solveSketch.test.ts` покрывает radius/horizontal/distance; здесь —
 * vertical, coincident, parallel, perpendicular, equal, angle, а также
 * поведение солвера на конфликтующих и избыточных системах.
 */

const line = (id: string, x1: number, y1: number, x2: number, y2: number): SketchEntity => ({
  id,
  type: "line",
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
});

const constraint = (
  type: SketchConstraint["type"],
  anchors: { entity_id: string; sub_index: number }[],
  value: number | null = null,
): SketchConstraint => ({ id: `c-${type}-${anchors[0].entity_id}`, type, anchors, value });

const dir = (e: SketchEntity) => {
  const dx = e.end!.x - e.start!.x;
  const dy = e.end!.y - e.start!.y;
  const len = Math.hypot(dx, dy);
  return { x: dx / len, y: dy / len };
};

const cross = (a: SketchEntity, b: SketchEntity) => {
  const u = dir(a);
  const v = dir(b);
  return Math.abs(u.x * v.y - u.y * v.x);
};

const dot = (a: SketchEntity, b: SketchEntity) => {
  const u = dir(a);
  const v = dir(b);
  return Math.abs(u.x * v.x + u.y * v.y);
};

const length = (e: SketchEntity) => Math.hypot(e.end!.x - e.start!.x, e.end!.y - e.start!.y);

describe("вертикальность", () => {
  it("выравнивает концы отрезка по X", () => {
    const out = solveSketch(
      [line("l", 0, 0, 4, 10)],
      [constraint("vertical", [{ entity_id: "l", sub_index: 0 }])],
    );
    expect(out.entities[0].start!.x).toBeCloseTo(out.entities[0].end!.x, 6);
  });

  it("уже вертикальный отрезок не двигается", () => {
    const out = solveSketch(
      [line("l", 3, 0, 3, 10)],
      [constraint("vertical", [{ entity_id: "l", sub_index: 0 }])],
    );
    expect(out.entities[0].start!.x).toBeCloseTo(3, 6);
    expect(length(out.entities[0])).toBeCloseTo(10, 6);
  });
});

describe("совпадение точек", () => {
  it("сводит концы двух отрезков в одну точку", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 12, 3, 20, 3)],
      [
        constraint("coincident", [
          { entity_id: "a", sub_index: 1 },
          { entity_id: "b", sub_index: 0 },
        ]),
      ],
    );
    const [a, b] = out.entities;
    expect(a.end!.x).toBeCloseTo(b.start!.x, 3);
    expect(a.end!.y).toBeCloseTo(b.start!.y, 3);
  });

  it("сходится и оставляет остаток около нуля", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 40, 40, 50, 40)],
      [
        constraint("coincident", [
          { entity_id: "a", sub_index: 1 },
          { entity_id: "b", sub_index: 0 },
        ]),
      ],
    );
    expect(out.residual).toBeLessThan(0.1);
  });
});

describe("параллельность и перпендикулярность", () => {
  it("параллельность обнуляет векторное произведение направлений", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 0, 5, 8, 9)],
      [
        constraint("parallel", [
          { entity_id: "a", sub_index: 0 },
          { entity_id: "b", sub_index: 0 },
        ]),
      ],
    );
    expect(cross(out.entities[0], out.entities[1])).toBeLessThan(0.05);
  });

  it("перпендикулярность обнуляет скалярное произведение", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 0, 0, 8, 3)],
      [
        constraint("perpendicular", [
          { entity_id: "a", sub_index: 0 },
          { entity_id: "b", sub_index: 0 },
        ]),
      ],
    );
    expect(dot(out.entities[0], out.entities[1])).toBeLessThan(0.05);
  });

  it("уже параллельные отрезки остаются на месте", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 0, 5, 10, 5)],
      [
        constraint("parallel", [
          { entity_id: "a", sub_index: 0 },
          { entity_id: "b", sub_index: 0 },
        ]),
      ],
    );
    expect(out.entities[1].start!.y).toBeCloseTo(5, 3);
  });
});

describe("равенство", () => {
  it("уравнивает длины отрезков", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 0, 5, 30, 5)],
      [
        constraint("equal", [
          { entity_id: "a", sub_index: 0 },
          { entity_id: "b", sub_index: 0 },
        ]),
      ],
    );
    expect(length(out.entities[0])).toBeCloseTo(length(out.entities[1]), 1);
  });

  it("уравнивает радиусы окружностей", () => {
    const circles: SketchEntity[] = [
      { id: "c1", type: "circle", center: { x: 0, y: 0 }, radius: 5 },
      { id: "c2", type: "circle", center: { x: 50, y: 0 }, radius: 20 },
    ];
    const out = solveSketch(circles, [
      constraint("equal", [
        { entity_id: "c1", sub_index: 0 },
        { entity_id: "c2", sub_index: 0 },
      ]),
    ]);
    expect(out.entities[0].radius!).toBeCloseTo(out.entities[1].radius!, 1);
  });
});

describe("угол", () => {
  it("сводит угол между отрезками к заданному", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0), line("b", 0, 0, 10, 1)],
      [
        constraint(
          "angle",
          [
            { entity_id: "a", sub_index: 0 },
            { entity_id: "b", sub_index: 0 },
          ],
          45,
        ),
      ],
    );
    const u = dir(out.entities[0]);
    const v = dir(out.entities[1]);
    const deg = (Math.acos(Math.min(1, Math.abs(u.x * v.x + u.y * v.y))) * 180) / Math.PI;
    expect(deg).toBeCloseTo(45, 0);
  });
});

describe("устойчивость солвера", () => {
  it("несколько ограничений применяются совместно", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 3), line("b", 0, 8, 9, 12)],
      [
        constraint("horizontal", [{ entity_id: "a", sub_index: 0 }]),
        constraint("horizontal", [{ entity_id: "b", sub_index: 0 }]),
        constraint("equal", [
          { entity_id: "a", sub_index: 0 },
          { entity_id: "b", sub_index: 0 },
        ]),
      ],
    );
    expect(out.entities[0].start!.y).toBeCloseTo(out.entities[0].end!.y, 3);
    expect(out.entities[1].start!.y).toBeCloseTo(out.entities[1].end!.y, 3);
    expect(length(out.entities[0])).toBeCloseTo(length(out.entities[1]), 0);
  });

  it("противоречивая система не зацикливается и честно сообщает остаток", () => {
    // Отрезок не может быть одновременно горизонтальным и вертикальным.
    const out = solveSketch(
      [line("l", 0, 0, 10, 10)],
      [
        constraint("horizontal", [{ entity_id: "l", sub_index: 0 }]),
        constraint("vertical", [{ entity_id: "l", sub_index: 0 }]),
      ],
    );
    expect(Number.isFinite(out.residual)).toBe(true);
    expect(out.entities[0].start).toBeDefined();
  });

  it("ссылка на несуществующую геометрию не роняет солвер", () => {
    const out = solveSketch(
      [line("a", 0, 0, 10, 0)],
      [
        constraint("coincident", [
          { entity_id: "a", sub_index: 1 },
          { entity_id: "ghost", sub_index: 0 },
        ]),
      ],
    );
    expect(out.entities).toHaveLength(1);
    expect(Number.isFinite(out.residual)).toBe(true);
  });

  it("пустой эскиз обрабатывается без ошибок", () => {
    const out = solveSketch([], []);
    expect(out.entities).toEqual([]);
    expect(out.converged).toBe(true);
  });

  it("координаты остаются конечными числами", () => {
    const out = solveSketch(
      [line("a", 0, 0, 0.0001, 0), line("b", 0, 0, 1000, 1000)],
      [
        constraint("perpendicular", [
          { entity_id: "a", sub_index: 0 },
          { entity_id: "b", sub_index: 0 },
        ]),
      ],
    );
    for (const e of out.entities) {
      expect(Number.isFinite(e.start!.x)).toBe(true);
      expect(Number.isFinite(e.start!.y)).toBe(true);
      expect(Number.isFinite(e.end!.x)).toBe(true);
      expect(Number.isFinite(e.end!.y)).toBe(true);
    }
  });
});
