import { describe, expect, it } from "vitest";
import { curveArea, curveIntersections, curveParamOf, horizontalCrossings, swapAxes, type Curve } from "./sketchCurves";

const line = (x1: number, y1: number, x2: number, y2: number): Curve => ({ kind: "line", a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
const arc = (x: number, y: number, r: number, a0: number, sweep: number): Curve => ({ kind: "arc", c: { x, y }, r, a0, sweep });

describe("sketchCurves", () => {
  it("intersects crossing lines and reports T-junctions at the endpoint", () => {
    expect(curveIntersections(line(0, 0, 10, 0), line(5, -5, 5, 5))[0]).toEqual({ ta: 0.5, tb: 0.5 });
    expect(curveIntersections(line(0, 0, 10, 0), line(5, 0, 5, 5)).map((hit) => hit.tb)).toContain(0);
  });

  it("finds the overlap ends of collinear segments", () => {
    const hits = curveIntersections(line(0, 0, 10, 0), line(5, 0, 15, 0));

    expect(hits.map((hit) => hit.ta).sort()).toEqual([0.5, 1]);
  });

  it("intersects a line with a circle and respects the arc span", () => {
    const circle = arc(0, 0, 5, 0, 2 * Math.PI);
    const upper = arc(0, 0, 5, 0, Math.PI);

    expect(curveIntersections(line(-10, 0, 10, 0), circle)).toHaveLength(2);
    expect(curveIntersections(line(-10, 3, 10, 3), upper)).toHaveLength(2);
    expect(curveIntersections(line(-10, -3, 10, -3), upper)).toHaveLength(0);
  });

  it("maps points onto clockwise arcs", () => {
    const clockwise = arc(0, 0, 1, Math.PI / 2, -Math.PI / 2);

    expect(curveParamOf(clockwise, { x: Math.SQRT1_2, y: Math.SQRT1_2 })).toBeCloseTo(0.5, 9);
    expect(curveParamOf(clockwise, { x: -1, y: 0 })).toBeNull();
  });

  it("integrates the exact area of a circle and a triangle", () => {
    expect(curveArea(arc(3, 4, 2, 0, 2 * Math.PI))).toBeCloseTo(4 * Math.PI, 12);
    const triangle = [line(0, 0, 4, 0), line(4, 0, 0, 3), line(0, 3, 0, 0)];
    expect(triangle.reduce((sum, edge) => sum + curveArea(edge), 0)).toBeCloseTo(6, 12);
  });

  it("counts horizontal crossings of an arc on its monotone pieces", () => {
    const circle = arc(0, 0, 5, 0, 2 * Math.PI);

    expect(horizontalCrossings(circle, 3).sort((a, b) => a - b)).toEqual([expect.closeTo(-4, 9), expect.closeTo(4, 9)]);
    expect(horizontalCrossings(circle, 6)).toEqual([]);
    expect(horizontalCrossings(swapAxes(arc(0, 0, 5, -Math.PI / 2, Math.PI)), 3).sort((a, b) => a - b)).toEqual([
      expect.closeTo(-4, 9),
      expect.closeTo(4, 9),
    ]);
    expect(horizontalCrossings(swapAxes(arc(0, 0, 5, -Math.PI / 2, Math.PI)), -3)).toEqual([]);
  });
});
