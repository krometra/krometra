import { describe, expect, it } from "vitest";
import { browserExtrudeFrame, browserPlaneFrame, browserRevolveFrame, sketchPlaneNormal } from "./browserExtrudeFrame";

describe("browserExtrudeFrame", () => {
  it("начинает призму с нижней границы интервала вдоль нормали XZ-плоскости", () => {
    expect(browserExtrudeFrame({
      plane: "XZ",
      planeOffset: 7,
      planeBasis: null,
      center: { x: 7, y: 13 },
    }, { start: -5, end: 5 })).toEqual({
      origin: [7, 2, 13],
      u: [1, 0, 0],
      v: [0, 0, 1],
      n: [0, 1, 0],
      length: 10,
    });
  });

  it("сохраняет заданный базис эскиза на грани", () => {
    expect(browserExtrudeFrame({
      plane: "XY",
      planeOffset: 0,
      planeBasis: { origin: [10, 20, 30], u: [0, 1, 0], v: [-1, 0, 0], n: [0, 0, 1] },
      center: { x: 4, y: 5 },
    }, { start: 0, end: 6 })).toEqual({
      origin: [5, 24, 30],
      u: [0, 1, 0],
      v: [-1, 0, 0],
      n: [0, 0, 1],
      length: 6,
    });
  });

  it("отклоняет пустой интервал", () => {
    const input = { plane: "XY" as const, planeOffset: 0, planeBasis: null, center: { x: 0, y: 0 } };
    expect(() => browserExtrudeFrame(input, { start: 2, end: 2 })).toThrow("больше нуля");
  });

  it("переносит ось вращения из локальных координат XZ-эскиза", () => {
    expect(browserRevolveFrame({
      plane: "XZ",
      planeOffset: 7,
      planeBasis: null,
      center: { x: 7, y: 13 },
      axisOrigin: { x: 3, y: 11 },
      axis: "y",
    })).toMatchObject({
      axis: [0, 0, 1],
      origin: [3, 7, 11],
    });
  });

  it("строит нормаль плоскости эскиза как u × v, чтобы ось y эскиза шла по v", () => {
    const normalOf = (plane: "XY" | "XZ" | "YZ") =>
      sketchPlaneNormal(browserPlaneFrame({ plane, planeOffset: 0, planeBasis: null, center: { x: 0, y: 0 } }));
    expect(normalOf("XY")).toEqual([0, 0, 1]);
    expect(normalOf("XZ")).toEqual([0, -1, 0]);
    expect(normalOf("YZ")).toEqual([1, 0, 0]);
  });
});
