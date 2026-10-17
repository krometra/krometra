import { describe, expect, it } from "vitest";
import type { SketchEntity, SketchPoint } from "@/types/api";
import { mergedProfileOf, mergeRegions, polygonIndexAt, regionIndexAt, regionPolygon, sketchRegionLayout, sketchRegions } from "./sketchRegions";

const circle = (id: string, x: number, y: number, radius: number): SketchEntity => ({ id, type: "circle", center: { x, y }, radius });
const rect = (id: string, x1: number, y1: number, x2: number, y2: number): SketchEntity => ({
  id, type: "rectangle", corner1: { x: x1, y: y1 }, corner2: { x: x2, y: y2 },
});
const line = (id: string, x1: number, y1: number, x2: number, y2: number): SketchEntity => ({
  id, type: "line", start: { x: x1, y: y1 }, end: { x: x2, y: y2 },
});

const areas = (entities: SketchEntity[]) => sketchRegions(entities).map((region) => region.area).sort((a, b) => a - b);

function polygonArea(points: SketchPoint[]): number {
  return points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + (p.x * q.y - q.x * p.y) / 2;
  }, 0);
}

const lensOfCircleAndStrip = 5 * Math.sqrt(75) + (100 * Math.PI) / 6;
const lensOfTwoCircles = 50 * Math.acos(0.6) - 24;

describe("sketchRegions", () => {
  it("splits a circle overlapping a rectangle into three regions with analytic areas", () => {
    const result = areas([circle("c", 0, 0, 10), rect("r", 0, -5, 20, 5)]);

    expect(result).toHaveLength(3);
    expect(result[0]).toBeCloseTo(lensOfCircleAndStrip, 9);
    expect(result[1]).toBeCloseTo(200 - lensOfCircleAndStrip, 9);
    expect(result[2]).toBeCloseTo(100 * Math.PI - lensOfCircleAndStrip, 9);
  });

  it("splits two overlapping circles into a lens and two crescents", () => {
    const result = areas([circle("a", 0, 0, 5), circle("b", 6, 0, 5)]);

    expect(result).toHaveLength(3);
    expect(result[0]).toBeCloseTo(lensOfTwoCircles, 9);
    expect(result[1]).toBeCloseTo(25 * Math.PI - lensOfTwoCircles, 9);
    expect(result[2]).toBeCloseTo(25 * Math.PI - lensOfTwoCircles, 9);
  });

  it("cuts a rectangle with a line and drops the dangling ends", () => {
    expect(areas([rect("r", 0, 0, 10, 10), line("l", 4, -2, 4, 12)])).toEqual([
      expect.closeTo(40, 9),
      expect.closeTo(60, 9),
    ]);
  });

  it("cuts a square into four triangles with two diagonals", () => {
    const result = areas([rect("r", 0, 0, 10, 10), line("d1", 0, 0, 10, 10), line("d2", 0, 10, 10, 0)]);

    expect(result).toHaveLength(4);
    result.forEach((area) => expect(area).toBeCloseTo(25, 9));
  });

  it("keeps a nested circle as a hole of the outer region and as a region of its own", () => {
    const regions = sketchRegions([rect("r", -20, -20, 20, 20), circle("c", 0, 0, 4)]);
    const plate = regions.find((region) => region.holes.length === 1);
    const disk = regions.find((region) => region.holes.length === 0);

    expect(regions).toHaveLength(2);
    expect(plate?.area).toBeCloseTo(1600 - 16 * Math.PI, 9);
    expect(disk?.area).toBeCloseTo(16 * Math.PI, 9);
  });

  it("treats a bridge between a hole and the outer contour as part of one region", () => {
    const regions = sketchRegions([rect("r", -20, -20, 20, 20), circle("c", 0, 0, 4), line("b", 4, 0, 20, 0)]);
    const plate = regions.find((region) => region.area > 100);

    expect(regions).toHaveLength(2);
    expect(plate?.area).toBeCloseTo(1600 - 16 * Math.PI, 9);
    expect(plate?.holes).toHaveLength(1);
  });

  it("splits the plate in two when the hole is bridged on both sides", () => {
    const result = areas([rect("r", -20, -20, 20, 20), circle("c", 0, 0, 4), line("b", 4, 0, 20, 0), line("a", -20, 0, -4, 0)]);

    expect(result).toHaveLength(3);
    expect(result[1]).toBeCloseTo(800 - 8 * Math.PI, 9);
    expect(result[2]).toBeCloseTo(800 - 8 * Math.PI, 9);
  });

  it("handles internally tangent circles", () => {
    expect(areas([circle("big", 0, 0, 10), circle("small", 5, 0, 5)])).toEqual([
      expect.closeTo(25 * Math.PI, 9),
      expect.closeTo(75 * Math.PI, 9),
    ]);
  });

  it("merges rectangles sharing a collinear edge into separate regions", () => {
    expect(areas([rect("a", 0, 0, 10, 10), rect("b", 10, 0, 20, 5)])).toEqual([
      expect.closeTo(50, 9),
      expect.closeTo(100, 9),
    ]);
  });

  it("builds an exact slot from lines and arcs", () => {
    const slot: SketchEntity[] = [
      line("top", -10, 5, 10, 5),
      { id: "right", type: "arc", center: { x: 10, y: 0 }, radius: 5, startAngle: -Math.PI / 2, endAngle: Math.PI / 2 },
      line("bottom", 10, -5, -10, -5),
      { id: "left", type: "arc", center: { x: -10, y: 0 }, radius: 5, startAngle: Math.PI / 2, endAngle: (3 * Math.PI) / 2 },
    ];

    expect(areas(slot)).toEqual([expect.closeTo(200 + 25 * Math.PI, 9)]);
  });

  it("ignores construction geometry and open chains", () => {
    expect(sketchRegions([line("a", 0, 0, 10, 0), line("b", 10, 0, 10, 10)])).toEqual([]);
    expect(sketchRegions([rect("r", 0, 0, 10, 10), { ...line("c", 5, -5, 5, 15), construction: true } as SketchEntity])).toHaveLength(1);
  });

  it("puts the representative point strictly inside its own region", () => {
    const layout = sketchRegionLayout([circle("c", 0, 0, 10), rect("r", 0, -5, 20, 5), circle("h", -5, 0, 2)]);

    layout.regions.forEach((region, index) => expect(regionIndexAt(layout, region.point)).toBe(index));
  });

  it("keeps region keys when dimensions change but the topology does not", () => {
    const before = sketchRegions([circle("c", 0, 0, 10), rect("r", 0, -5, 20, 5)]);
    const after = sketchRegions([circle("c", 1, 0, 12), rect("r", 2, -4, 25, 6)]);
    const byArea = (regions: typeof before) => [...regions].sort((a, b) => a.area - b.area).map((region) => region.key);

    expect(new Set(before.map((region) => region.key)).size).toBe(3);
    expect(after.map((region) => region.key).sort()).toEqual(before.map((region) => region.key).sort());
    expect(byArea(after)[0]).toBe(byArea(before)[0]);
  });

  it("distinguishes regions bounded by the same entities on different sides", () => {
    const regions = sketchRegions([circle("a", 0, 0, 5), circle("b", 6, 0, 5)]);

    expect(new Set(regions.map((region) => region.key)).size).toBe(3);
  });
});

describe("mergeRegions", () => {
  it("merges adjacent regions into one face without the shared edge", () => {
    const layout = sketchRegionLayout([rect("a", 0, 0, 10, 10), rect("b", 10, 0, 20, 5)]);
    const merged = mergeRegions(layout, layout.regions.map((region) => region.key));

    expect(merged.regions).toHaveLength(1);
    expect(merged.regions[0].outer.segments).toHaveLength(7);
    expect(polygonArea(merged.polygons[0].outer)).toBeCloseTo(150, 9);
  });

  it("merges the lens back into the circle and keeps holes", () => {
    const layout = sketchRegionLayout([circle("c", 0, 0, 10), rect("r", 0, -5, 20, 5), circle("h", -5, 0, 2)]);
    const circleParts = layout.regions.filter((region) => region.point.x < 10 && region.area > 50);
    const merged = mergeRegions(layout, circleParts.map((region) => region.key));

    expect(circleParts).toHaveLength(2);
    expect(merged.regions).toHaveLength(1);
    expect(merged.regions[0].holes).toHaveLength(1);
    expect(polygonArea(merged.polygons[0].outer) / (100 * Math.PI)).toBeCloseTo(1, 2);
  });

  it("keeps disjoint selected regions as separate faces", () => {
    const layout = sketchRegionLayout([circle("a", 0, 0, 5), circle("b", 6, 0, 5)]);
    const crescents = layout.regions.filter((region) => region.area > lensOfTwoCircles + 1);

    expect(mergeRegions(layout, crescents.map((region) => region.key)).regions).toHaveLength(2);
  });

  it("names unsplit edges with the legacy probe keys", () => {
    const layout = sketchRegionLayout([rect("r", 0, 0, 10, 10), circle("c", 30, 0, 3)]);
    const probes = mergeRegions(layout, layout.regions.map((region) => region.key)).probes.map((probe) => probe.key).sort();

    expect(probes).toEqual(["c", "c.1", "r.0", "r.1", "r.2", "r.3"]);
  });

  it("names split pieces by source and piece index", () => {
    const layout = sketchRegionLayout([rect("r", 0, 0, 10, 10), line("l", 4, -2, 4, 12)]);
    const left = layout.regions.find((region) => region.area < 50)!;
    const keys = mergeRegions(layout, [left.key]).probes.map((probe) => probe.key).sort();

    expect(keys).toEqual(["l:1", "r.0:0", "r.2:1", "r.3"]);
  });

  it("explains a region that disappeared after a sketch edit", () => {
    expect(() => mergedProfileOf([rect("r", 0, 0, 10, 10)], ["rmissing"])).toThrow("Выберите профиль заново");
  });
});

describe("polygonIndexAt", () => {
  it("finds the region polygon under a point and skips holes", () => {
    const layout = sketchRegionLayout([rect("r", -20, -20, 20, 20), circle("c", 0, 0, 4)]);
    const polygons = layout.regions.map((_, index) => regionPolygon(layout, index));
    const plate = layout.regions.findIndex((region) => region.holes.length === 1);
    const disk = layout.regions.findIndex((region) => region.holes.length === 0);

    expect(polygonIndexAt(polygons, { x: 10, y: 10 })).toBe(plate);
    expect(polygonIndexAt(polygons, { x: 1, y: 1 })).toBe(disk);
    expect(polygonIndexAt(polygons, { x: 30, y: 0 })).toBeNull();
  });
});
