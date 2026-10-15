import { describe, expect, it } from "vitest";
import type { SketchArc, SketchEntity } from "@/types/api";
import { browserContours } from "@/lib/browserContours";
import { arcEndpoints, areCollinear, ccwSweep, isAngleOnArc, threePointArc } from "./arcGeometry";
import { isPointNearEntity } from "./geometry";
import { profileContours } from "./contours";
import { solveSketch } from "./solver/solveSketch";

const p = (x: number, y: number) => ({ x, y });

function arcEntity(id: string, start = p(10, 0), end = p(-10, 0), via = p(0, 10)): SketchArc {
  const shape = threePointArc(start, end, via);
  if (!shape) throw new Error("дуга не построилась");
  return { id, type: "arc", ...shape };
}

function expectPointsClose(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

describe("ccwSweep", () => {
  it("меряет угол против часовой стрелки в пределах полного оборота", () => {
    expect(ccwSweep(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(ccwSweep(Math.PI / 2, 0)).toBeCloseTo(Math.PI * 1.5);
    expect(ccwSweep(3, -3)).toBeCloseTo(2 * Math.PI - 6);
  });
});

describe("threePointArc", () => {
  it("верхняя полуокружность: центр, радиус и углы против часовой", () => {
    const arc = threePointArc(p(10, 0), p(-10, 0), p(0, 10))!;
    expectPointsClose(arc.center, p(0, 0));
    expect(arc.radius).toBeCloseTo(10);
    expect(arc.startAngle).toBeCloseTo(0);
    expect(arc.endAngle).toBeCloseTo(Math.PI);
  });

  it("точка снизу даёт нижнюю дугу: начало и конец меняются местами", () => {
    const arc = threePointArc(p(10, 0), p(-10, 0), p(0, -10))!;
    expect(arc.radius).toBeCloseTo(10);
    expect(arc.startAngle).toBeCloseTo(Math.PI);
    expect(arc.endAngle).toBeCloseTo(2 * Math.PI);
    const [first, last] = arcEndpoints(arc);
    expectPointsClose(first, p(-10, 0));
    expectPointsClose(last, p(10, 0));
  });

  it("дуга через отрицательную ось X: конец больше начала", () => {
    const arc = threePointArc(p(0, 5), p(0, -5), p(-5, 0))!;
    expect(arc.startAngle).toBeCloseTo(Math.PI / 2);
    expect(arc.endAngle).toBeCloseTo(Math.PI * 1.5);
  });

  it("проходит через все три точки, включая промежуточную", () => {
    const start = p(3, 7);
    const end = p(40, -2);
    const via = p(25, 12);
    const arc = threePointArc(start, end, via)!;
    for (const point of [start, end, via]) {
      expect(Math.hypot(point.x - arc.center.x, point.y - arc.center.y)).toBeCloseTo(arc.radius, 6);
    }
    const viaAngle = Math.atan2(via.y - arc.center.y, via.x - arc.center.x);
    expect(isAngleOnArc(viaAngle, arc.startAngle, arc.endAngle, 0)).toBe(true);
  });

  it("большая дуга больше полуокружности, если точка за хордой", () => {
    const arc = threePointArc(p(10, 0), p(0, 10), p(-10, 0))!;
    expect(arc.endAngle - arc.startAngle).toBeCloseTo(Math.PI * 1.5);
  });

  it("коллинеарные и совпадающие точки дугу не строят", () => {
    expect(threePointArc(p(0, 0), p(20, 0), p(10, 0))).toBeNull();
    expect(threePointArc(p(0, 0), p(20, 0), p(30, 0.001))).toBeNull();
    expect(threePointArc(p(0, 0), p(20, 0), p(20, 0))).toBeNull();
    expect(threePointArc(p(0, 0), p(0, 0), p(5, 5))).toBeNull();
  });
});

describe("areCollinear", () => {
  it("различает прямую и малый, но заметный изгиб", () => {
    expect(areCollinear(p(0, 0), p(100, 0), p(50, 0.01))).toBe(true);
    expect(areCollinear(p(0, 0), p(100, 0), p(50, 2))).toBe(false);
  });

  it("совпадающие точки — не коллинеарность, а вырожденный случай", () => {
    expect(areCollinear(p(0, 0), p(100, 0), p(100, 0))).toBe(false);
  });
});

describe("дуга по трём точкам в остальном скетчере", () => {
  it("выбирается кликом по всей длине, включая участок за ±180°", () => {
    const arc = arcEntity("a", p(0, 5), p(0, -5), p(-5, 0));
    expect(isPointNearEntity(p(-5, 0), arc, 0.5)).toBe(true);
    expect(isPointNearEntity(p(-3.54, -3.54), arc, 0.5)).toBe(true);
    expect(isPointNearEntity(p(5, 0), arc, 0.5)).toBe(false);
  });

  it("замыкает контур с отрезком: профиль для выдавливания", () => {
    const entities: SketchEntity[] = [
      arcEntity("a"),
      { id: "l", type: "line", start: p(-10, 0), end: p(10, 0) },
    ];
    expect(profileContours(entities)).toHaveLength(1);
    const contours = browserContours(entities);
    expect(contours).toHaveLength(1);
    const arcSegment = contours[0].segments.find((s) => s.kind === "arc");
    expect(arcSegment).toBeDefined();
    if (arcSegment?.kind === "arc") expectPointsClose(arcSegment.via, p(0, 10));
  });

  it("решатель сохраняет направление дуги, проходящей через ±180°", () => {
    const arc = arcEntity("a", p(0, 5), p(0, -5), p(-5, 0));
    const out = solveSketch(
      [arc, { id: "l", type: "line", start: p(0, -5), end: p(0, 5) }],
      [{ id: "c", type: "coincident", anchors: [{ entity_id: "a", sub_index: 1 }, { entity_id: "l", sub_index: 1 }], value: null }],
    );
    const solved = out.entities.find((e) => e.id === "a")!;
    expect(solved.endAngle! - solved.startAngle!).toBeCloseTo(Math.PI, 3);
  });
});
