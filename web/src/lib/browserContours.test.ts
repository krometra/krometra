import { describe, expect, it } from "vitest";
import { browserContourPolygon, browserContours, browserRegions } from "./browserContours";
import type { SketchEntity } from "@/types/api";

const slot: SketchEntity[] = [
  { id: "top", type: "line", start: { x: -10, y: 5 }, end: { x: 10, y: 5 } },
  { id: "right", type: "arc", center: { x: 10, y: 0 }, radius: 5, startAngle: -Math.PI / 2, endAngle: Math.PI / 2 },
  { id: "bottom", type: "line", start: { x: 10, y: -5 }, end: { x: -10, y: -5 } },
  { id: "left", type: "arc", center: { x: -10, y: 0 }, radius: 5, startAngle: Math.PI / 2, endAngle: 3 * Math.PI / 2 },
];

describe("browserContours", () => {
  it("chains lines and arcs into one closed exact contour regardless of drawing direction", () => {
    const [contour] = browserContours(slot);

    expect(contour.segments.map((s) => s.kind)).toEqual(["line", "arc", "line", "arc"]);
    contour.segments.forEach((segment, i) => {
      const next = contour.segments[(i + 1) % contour.segments.length];
      expect(segment.end.x).toBeCloseTo(next.start.x, 6);
      expect(segment.end.y).toBeCloseTo(next.start.y, 6);
    });
    expect(contour.segments.at(-1)!.end).toBe(contour.start);
  });

  it("keeps the arc bulge on the correct side when the arc is reversed", () => {
    const [contour] = browserContours(slot);
    const rightArc = contour.segments.find((s) => s.kind === "arc" && s.start.x > 0);

    expect(rightArc?.kind === "arc" && rightArc.via.x).toBeCloseTo(15, 6);
  });

  it("rejects an open chain instead of silently closing it", () => {
    expect(() => browserContours(slot.slice(0, 3))).toThrow("не замкнут");
  });

  it("ignores construction geometry", () => {
    expect(browserContours([...slot, { id: "c", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, construction: true }])).toHaveLength(1);
  });
});

describe("browserContourPolygon", () => {
  it("samples arcs along the true circle", () => {
    const [circle] = browserContours([{ id: "c", type: "circle", center: { x: 1, y: 2 }, radius: 3 }]);

    for (const point of browserContourPolygon(circle)) {
      expect(Math.hypot(point.x - 1, point.y - 2)).toBeCloseTo(3, 9);
    }
  });
});

describe("browserRegions", () => {
  it("turns a circle inside a rectangle into a hole", () => {
    const regions = browserRegions([
      { id: "r", type: "rectangle", corner1: { x: -20, y: -20 }, corner2: { x: 20, y: 20 } },
      { id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 4 },
    ]);

    expect(regions).toHaveLength(1);
    expect(regions[0].outer.segments).toHaveLength(4);
    expect(regions[0].holes[0].segments.map((s) => s.kind)).toEqual(["arc", "arc"]);
  });

  it("keeps separate contours as separate regions", () => {
    expect(browserRegions([
      { id: "a", type: "circle", center: { x: 0, y: 0 }, radius: 2 },
      { id: "b", type: "circle", center: { x: 10, y: 0 }, radius: 2 },
    ])).toHaveLength(2);
  });
});
