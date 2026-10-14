import { describe, expect, it } from "vitest";
import { sectionContours, type SectionBasis } from "./sectionContours";

const XY_AT_2: SectionBasis = { origin: [0, 0, 2], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };

const segment = (a: [number, number], b: [number, number]) => [a[0], a[1], 2, b[0], b[1], 2];

describe("sectionContours", () => {
  it("сшивает рёбра в замкнутый контур независимо от их направления", () => {
    const [square] = sectionContours(
      [segment([0, 0], [10, 0]), segment([10, 4], [10, 0]), segment([10, 4], [0, 4]), segment([0, 0], [0, 4])],
      XY_AT_2,
    );
    expect(square.closed).toBe(true);
    expect(square.area).toBe(40);
    expect(square.length).toBe(28);
    expect(square.bbox).toEqual({ min: [0, 0], max: [10, 4] });
  });

  it("отверстие даёт второй контур, контуры идут по убыванию площади", () => {
    const ring = Array.from({ length: 65 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 64;
      return [5 + Math.cos(angle), 2 + Math.sin(angle), 2];
    }).flat();
    const contours = sectionContours(
      [ring, segment([0, 0], [10, 0]), segment([10, 0], [10, 4]), segment([10, 4], [0, 4]), segment([0, 4], [0, 0])],
      XY_AT_2,
    );
    expect(contours.map((contour) => contour.closed)).toEqual([true, true]);
    expect(contours[0].area).toBe(40);
    expect(contours[1].area).toBeCloseTo(Math.PI, 1);
  });

  it("незамкнутая цепочка остаётся открытой без площади", () => {
    const [open] = sectionContours([segment([0, 0], [5, 0]), segment([5, 0], [5, 5])], XY_AT_2);
    expect(open.closed).toBe(false);
    expect(open.area).toBeNull();
    expect(open.points).toEqual([[0, 0], [5, 0], [5, 5]]);
  });
});
