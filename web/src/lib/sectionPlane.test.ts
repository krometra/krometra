import { describe, expect, it } from "vitest";
import {
  baseAnchor,
  clampOffset,
  clipPlane,
  flipFacingCamera,
  isClipped,
  middleOffset,
  offsetRange,
  offsetStep,
  sectionPoint,
  sectionViewTarget,
  type SectionAnchor,
} from "./sectionPlane";

const BOX = { min: [-10, -5, 0] as [number, number, number], max: [10, 5, 20] as [number, number, number] };

describe("offsetRange", () => {
  it("базовая плоскость XY берёт высоты габарита по Z", () => {
    expect(offsetRange(baseAnchor("XY"), BOX)).toEqual({ min: 0, max: 20 });
  });

  it("XZ режет поперёк Y, YZ поперёк X", () => {
    expect(offsetRange(baseAnchor("XZ"), BOX)).toEqual({ min: -5, max: 5 });
    expect(offsetRange(baseAnchor("YZ"), BOX)).toEqual({ min: -10, max: 10 });
  });

  it("плоскость грани считает смещение от точки грани вдоль её нормали", () => {
    const top: SectionAnchor = { origin: [0, 0, 20], normal: [0, 0, 1] };
    expect(offsetRange(top, BOX)).toEqual({ min: -20, max: 0 });
  });

  it("наклонная нормаль проецирует все восемь углов", () => {
    const tilted: SectionAnchor = { origin: [0, 0, 0], normal: [Math.SQRT1_2, 0, Math.SQRT1_2] };
    const range = offsetRange(tilted, BOX);
    expect(range.min).toBeCloseTo(-10 * Math.SQRT1_2);
    expect(range.max).toBeCloseTo(30 * Math.SQRT1_2);
  });

  it("без тел диапазон вырожден в ноль", () => {
    expect(offsetRange(baseAnchor("XY"), null)).toEqual({ min: 0, max: 0 });
  });
});

describe("смещение", () => {
  it("по умолчанию середина диапазона", () => {
    expect(middleOffset({ min: 0, max: 20 })).toBe(10);
  });

  it("зажимается в диапазон, мусор заменяется серединой", () => {
    expect(clampOffset(25, { min: 0, max: 20 })).toBe(20);
    expect(clampOffset(-3, { min: 0, max: 20 })).toBe(0);
    expect(clampOffset(Number.NaN, { min: 0, max: 20 })).toBe(10);
  });

  it("шаг слайдера дробит диапазон, у пустого диапазона шаг ненулевой", () => {
    expect(offsetStep({ min: 0, max: 20 })).toBeCloseTo(0.1);
    expect(offsetStep({ min: 3, max: 3 })).toBeGreaterThan(0);
  });

  it("точка сечения сдвинута вдоль нормали", () => {
    expect(sectionPoint({ origin: [1, 2, 3], normal: [0, 1, 0] }, 4)).toEqual([1, 6, 3]);
  });
});

describe("clipPlane", () => {
  const anchor = baseAnchor("XY");

  it("по умолчанию оставляет сторону против нормали", () => {
    const plane = clipPlane(anchor, 10, false);
    expect(isClipped([0, 0, 15], plane)).toBe(true);
    expect(isClipped([0, 0, 5], plane)).toBe(false);
  });

  it("переворот оставляет сторону по нормали", () => {
    const plane = clipPlane(anchor, 10, true);
    expect(isClipped([0, 0, 15], plane)).toBe(false);
    expect(isClipped([0, 0, 5], plane)).toBe(true);
  });

  it("точка на самой плоскости остаётся", () => {
    expect(isClipped([3, -2, 10], clipPlane(anchor, 10, false))).toBe(false);
  });

  it("допуск не даёт отсечь точку чуть за плоскостью", () => {
    expect(isClipped([0, 0, 10.001], clipPlane(anchor, 10, false), 0.01)).toBe(false);
  });
});

describe("flipFacingCamera", () => {
  const anchor = baseAnchor("XZ");

  it("камера со стороны нормали видит срез без переворота", () => {
    expect(flipFacingCamera(anchor, 0, [10, 40, 5])).toBe(false);
  });

  it("камера спереди (с -Y) требует переворота, чтобы срез смотрел на неё", () => {
    const flipped = flipFacingCamera(anchor, 0, [10, -40, 5]);
    expect(flipped).toBe(true);
    expect(isClipped([0, -3, 0], clipPlane(anchor, 0, flipped))).toBe(true);
  });
});

describe("sectionViewTarget", () => {
  it("камера смотрит на срез со стороны отсечённой части, центр лежит в плоскости", () => {
    const target = sectionViewTarget(baseAnchor("XY"), 10, false, BOX);
    expect(target.center).toEqual([0, 0, 10]);
    expect(target.normal).toEqual([0, 0, 1]);
    expect(target.radius).toBeCloseTo(Math.hypot(20, 10, 20) / 2);
  });

  it("после переворота камера переходит на другую сторону", () => {
    const normal = sectionViewTarget(baseAnchor("XY"), 10, true, BOX).normal;
    expect(normal[2]).toBe(-1);
    expect(Math.hypot(normal[0], normal[1])).toBe(0);
  });

  it("без тел смотрит на начало координат", () => {
    const target = sectionViewTarget(baseAnchor("YZ"), 0, false, null);
    expect(target.center).toEqual([0, 0, 0]);
    expect(target.radius).toBeGreaterThan(0);
  });
});
