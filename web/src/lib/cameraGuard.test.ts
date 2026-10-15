import { describe, expect, it } from "vitest";
import { isUsableCamera, isUsableRadius, viewDirection } from "./cameraGuard";

describe("cameraGuard", () => {
  it("камера с NaN или в точке цели непригодна", () => {
    expect(isUsableCamera([1, 2, 3], [0, 0, 0])).toBe(true);
    expect(isUsableCamera([NaN, 2, 3], [0, 0, 0])).toBe(false);
    expect(isUsableCamera([1, 1, 1], [1, 1, 1])).toBe(false);
    expect(isUsableCamera([1, 2, 3], [Infinity, 0, 0])).toBe(false);
  });

  it("направление взгляда берётся из камеры, а при сбое — запасное", () => {
    expect(viewDirection([0, 0, 5], [0, 0, 0], [1, 0, 0])).toEqual([0, 0, 1]);
    expect(viewDirection([NaN, 0, 0], [0, 0, 0], [0, 3, 4])).toEqual([0, 0.6, 0.8]);
    expect(viewDirection([2, 2, 2], [2, 2, 2], [0, 0, 2])).toEqual([0, 0, 1]);
  });

  it("радиус пустой сферы непригоден для вписывания", () => {
    expect(isUsableRadius(-1)).toBe(false);
    expect(isUsableRadius(NaN)).toBe(false);
    expect(isUsableRadius(10)).toBe(true);
  });
});
