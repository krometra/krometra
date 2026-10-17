import { describe, expect, it } from "vitest";
import { browserContours } from "@/lib/browserContours";
import { profileFaces } from "@/sketcher/contours";
import type { SketchEntity as ProfileEntity } from "@/types/api";
import { solveSketch, type SketchConstraint, type SketchEntity } from "./solveSketch";

const line = (id: string, x1: number, y1: number, x2: number, y2: number): SketchEntity => ({
  id,
  type: "line",
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
});

const asProfile = (entities: SketchEntity[]) => entities as ProfileEntity[];

const ref = (entity_id: string, sub_index = 0) => ({ entity_id, sub_index });

function rectangle(prefix: string, x: number, y: number, w: number, h: number) {
  const ids = ["b", "r", "t", "l"].map((side) => `${prefix}${side}`);
  const [b, r, t, l] = ids;
  const entities = [
    line(b, x, y, x + w, y),
    line(r, x + w, y, x + w, y + h),
    line(t, x + w, y + h, x, y + h),
    line(l, x, y + h, x, y),
  ];
  const constraints: SketchConstraint[] = [
    { id: `${prefix}h1`, type: "horizontal", anchors: [ref(b)], value: null },
    { id: `${prefix}h2`, type: "horizontal", anchors: [ref(t)], value: null },
    { id: `${prefix}v1`, type: "vertical", anchors: [ref(r)], value: null },
    { id: `${prefix}v2`, type: "vertical", anchors: [ref(l)], value: null },
    ...ids.map((id, i) => ({
      id: `${prefix}c${i}`,
      type: "coincident" as const,
      anchors: [ref(id, 1), ref(ids[(i + 1) % 4], 0)],
      value: null,
    })),
  ];
  return { entities, constraints };
}

const dimension = (id: string, type: SketchConstraint["type"], anchors: SketchConstraint["anchors"], value: number): SketchConstraint => ({
  id,
  type,
  anchors,
  value,
});

function twoRectanglesWithDimensions(width: number, gap: number) {
  const a = rectangle("a", 0, 0, 20, 15);
  const b = rectangle("b", 40, 5, 18, 12);
  const constraints = [
    ...a.constraints,
    ...b.constraints,
    dimension("da-w", "length", [ref("ab")], width),
    dimension("da-h", "length", [ref("al")], 30),
    dimension("db-w", "length", [ref("bb")], width),
    dimension("db-h", "length", [ref("bl")], 30),
    dimension("gap", "horizontal_distance", [ref("ar", 0), ref("bl", 0)], gap),
    dimension("off", "vertical_distance", [ref("ab", 0), ref("bb", 0)], 0),
  ];
  return { entities: [...a.entities, ...b.entities], constraints };
}

function maxCornerGap(entities: SketchEntity[], constraints: SketchConstraint[]): number {
  const point = (r: { entity_id: string; sub_index: number }) => {
    const e = entities.find((x) => x.id === r.entity_id)!;
    return r.sub_index === 0 ? e.start! : e.end!;
  };
  return Math.max(
    ...constraints
      .filter((c) => c.type === "coincident")
      .map((c) => {
        const [p, q] = c.anchors.map(point);
        return Math.hypot(p.x - q.x, p.y - q.y);
      }),
  );
}

describe("прямоугольники из отрезков после правки размеров", () => {
  it.each([
    [31, 25],
    [45, 30],
    [5, 80],
  ])("углы остаются сомкнутыми: ширина %d, отступ %d", (width, gap) => {
    const sketch = twoRectanglesWithDimensions(width, gap);
    const out = solveSketch(sketch.entities, sketch.constraints);
    expect(maxCornerGap(out.entities, sketch.constraints)).toBeLessThan(1e-6);
    expect(() => browserContours(asProfile(out.entities))).not.toThrow();
    expect(profileFaces(asProfile(out.entities))).toHaveLength(2);
    expect(out.residual).toBeLessThan(1e-3);
  });

  it("повторное увеличение размера тоже не разрывает углы", () => {
    const sketch = twoRectanglesWithDimensions(20, 20);
    let entities = solveSketch(sketch.entities, sketch.constraints).entities;
    for (const width of [25, 31, 45, 70]) {
      const constraints = sketch.constraints.map((c) => (c.id === "da-w" || c.id === "db-w" ? { ...c, value: width } : c));
      entities = solveSketch(entities, constraints).entities;
      expect(maxCornerGap(entities, constraints)).toBeLessThan(1e-6);
    }
    expect(() => browserContours(asProfile(entities))).not.toThrow();
  });
});
