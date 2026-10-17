import { describe, expect, it } from "vitest";
import type { WorkPlaneFrame } from "./workPlane";
import { workPlaneQuad } from "./workPlaneQuad";

const frame: WorkPlaneFrame = { origin: [0, 0, 30], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };

describe("квадрат рабочей плоскости во вьюпорте", () => {
  it("центр — проекция центра модели на плоскость, размер по диагонали габарита", () => {
    const quad = workPlaneQuad(frame, { min: [0, 0, 0], max: [40, 30, 0] });
    expect(quad.center).toEqual([20, 15, 30]);
    expect(quad.size).toBeCloseTo(40, 9);
    expect(quad.corners[0]).toEqual([0, -5, 30]);
    expect(quad.corners[2]).toEqual([40, 35, 30]);
  });

  it("без тел — у начала плоскости и не меньше минимума", () => {
    expect(workPlaneQuad(frame, null)).toMatchObject({ center: [0, 0, 30], size: 40 });
    expect(workPlaneQuad(frame, { min: [0, 0, 0], max: [1, 1, 1] }).size).toBe(20);
  });
});
