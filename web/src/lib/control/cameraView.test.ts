import { describe, expect, it } from "vitest";
import { cameraViewParam, resolveCameraView } from "./cameraView";
import { parseParams } from "./params";
import { ControlError } from "./protocol";

const schema = { camera: cameraViewParam("Ракурс.") };
const fallback = { target: [1, 2, 3] as [number, number, number], up: [0, 0, 1] as [number, number, number] };

function rejected(camera: unknown): boolean {
  try {
    parseParams(schema, { camera });
    return false;
  } catch (error) {
    return error instanceof ControlError && error.code === "invalid_params";
  }
}

describe("cameraViewParam", () => {
  it("принимает позицию и необязательные цель и up", () => {
    expect(parseParams(schema, { camera: { position: [1, 2, 3] } }).camera).toEqual({ position: [1, 2, 3] });
    expect(parseParams(schema, { camera: { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0] } }).camera).toEqual({
      position: [1, 2, 3],
      target: [0, 0, 0],
      up: [0, 1, 0],
    });
    expect(parseParams(schema, { camera: { position: [1, 2, 3], target: null } }).camera).toEqual({ position: [1, 2, 3] });
  });

  it("отклоняет ракурс без позиции, с кривым вектором или лишним полем", () => {
    expect(rejected({ target: [0, 0, 0] })).toBe(true);
    expect(rejected({ position: [1, 2] })).toBe(true);
    expect(rejected({ position: [1, 2, 3], target: "origin" })).toBe(true);
    expect(rejected({ position: [1, 2, 3], fov: 60 })).toBe(true);
    expect(rejected([1, 2, 3])).toBe(true);
  });
});

describe("resolveCameraView", () => {
  it("недостающие цель и up берёт из текущего вида", () => {
    expect(resolveCameraView({ position: [9, 9, 9] }, fallback)).toEqual({ position: [9, 9, 9], target: [1, 2, 3], up: [0, 0, 1] });
  });

  it("заданные цель и up имеют приоритет", () => {
    expect(resolveCameraView({ position: [9, 9, 9], target: [0, 0, 0], up: [0, 1, 0] }, fallback)).toEqual({
      position: [9, 9, 9],
      target: [0, 0, 0],
      up: [0, 1, 0],
    });
  });

  it("камера в точке цели и нулевой up — ошибка параметров", () => {
    expect(() => resolveCameraView({ position: [1, 2, 3] }, fallback)).toThrow(ControlError);
    expect(() => resolveCameraView({ position: [5, 5, 5], up: [0, 0, 0] }, fallback)).toThrow(/up/);
  });
});
