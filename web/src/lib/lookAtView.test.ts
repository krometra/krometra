import { describe, expect, it } from "vitest";
import { basePlaneTarget, boundsSphere, fitDistance, interpolatePose, lookAtPose, slerpDirection, viewUp, type CameraPose } from "./lookAtView";
import type { Vec3 } from "./threadGeometry";
import { dot, magnitude, subtract } from "./vec3";

function expectVec(actual: Vec3, expected: Vec3) {
  actual.forEach((value, axis) => expect(value).toBeCloseTo(expected[axis], 6));
}

function direction(pose: CameraPose): Vec3 {
  const offset = subtract(pose.position, pose.target);
  const length = magnitude(offset);
  return [offset[0] / length, offset[1] / length, offset[2] / length];
}

describe("viewUp", () => {
  it("боковая грань: верх экрана — мировой +Z", () => {
    expectVec(viewUp([0, -1, 0]), [0, 0, 1]);
    expectVec(viewUp([1, 0, 0]), [0, 0, 1]);
  });

  it("сверху и снизу верх совпадает с видами ViewCube", () => {
    expectVec(viewUp([0, 0, 1]), [0, 1, 0]);
    expectVec(viewUp([0, 0, -1]), [0, -1, 0]);
  });

  it("наклонная грань: верх лежит в вертикальной плоскости и перпендикулярен нормали", () => {
    const normal: Vec3 = [0, -Math.SQRT1_2, Math.SQRT1_2];
    const up = viewUp(normal);
    expect(dot(up, normal)).toBeCloseTo(0);
    expect(up[0]).toBeCloseTo(0);
    expect(up[2]).toBeGreaterThan(0);
  });
});

describe("lookAtPose", () => {
  it("камера стоит на нормали к центру грани и смотрит в центр", () => {
    const pose = lookAtPose({ center: [5, 5, 10], normal: [0, 0, 1], radius: 10 }, 45);
    expectVec(pose.target, [5, 5, 10]);
    expectVec(direction(pose), [0, 0, 1]);
    expectVec(pose.up, [0, 1, 0]);
  });

  it("расстояние вписывает радиус в угол обзора с запасом", () => {
    const distance = fitDistance(10, 45);
    expect(10 / distance).toBeLessThan(Math.sin((45 * Math.PI) / 360));
    expect(fitDistance(Number.NaN, 45)).toBeGreaterThan(0);
    expect(fitDistance(0, 45)).toBeGreaterThan(0);
  });

  it("ненормированная нормаль нормируется", () => {
    const pose = lookAtPose({ center: [0, 0, 0], normal: [3, 0, 0], radius: 1 }, 45);
    expectVec(direction(pose), [1, 0, 0]);
  });
});

describe("slerpDirection", () => {
  it("концы совпадают с исходными направлениями", () => {
    expectVec(slerpDirection([1, 0, 0], [0, 1, 0], 0, [0, 0, 1]), [1, 0, 0]);
    expectVec(slerpDirection([1, 0, 0], [0, 1, 0], 1, [0, 0, 1]), [0, 1, 0]);
  });

  it("середина пути — единичный вектор между ними", () => {
    expectVec(slerpDirection([1, 0, 0], [0, 1, 0], 0.5, [0, 0, 1]), [Math.SQRT1_2, Math.SQRT1_2, 0]);
  });

  it("противоположные направления разворачиваются вокруг оси-подсказки, а не через ноль", () => {
    const half = slerpDirection([0, -1, 0], [0, 1, 0], 0.5, [0, 0, 1]);
    expect(magnitude(half)).toBeCloseTo(1);
    expect(half[2]).toBeCloseTo(0);
  });
});

describe("interpolatePose", () => {
  const front: CameraPose = { position: [0, -15, 0], target: [0, 0, 0], up: [0, 0, 1] };
  const back: CameraPose = { position: [0, 30, 0], target: [0, 0, 0], up: [0, 0, 1] };

  it("переход на противоположный вид не проходит через цель орбиты", () => {
    for (let step = 0; step <= 10; step++) {
      const pose = interpolatePose(front, back, step / 10);
      const distance = magnitude(subtract(pose.position, pose.target));
      expect(distance).toBeGreaterThanOrEqual(15 - 1e-9);
      expect(pose.position.every(Number.isFinite)).toBe(true);
    }
  });

  it("расстояние и цель меняются плавно, конец совпадает с целевым видом", () => {
    const end = interpolatePose(front, back, 1);
    expectVec(end.position, back.position);
    expectVec(end.up, back.up);
    const middle = interpolatePose(front, { ...back, target: [10, 0, 0] }, 0.5);
    expectVec(middle.target, [5, 0, 0]);
  });

  it("верх никогда не совпадает с направлением взгляда", () => {
    const iso: CameraPose = { position: [10, -10, 8.5], target: [0, 0, 0], up: [0, 0, 1] };
    const top: CameraPose = { position: [0, 0, 20], target: [0, 0, 0], up: [0, 1, 0] };
    for (let step = 0; step <= 20; step++) {
      const pose = interpolatePose(iso, top, step / 20);
      expect(Math.abs(dot(pose.up, direction(pose)))).toBeLessThan(0.999);
    }
  });

  it("вертикальный верх не заваливается в конце анимации", () => {
    const side: CameraPose = { position: [20, 0, 0], target: [0, 0, 0], up: [0, 0, 1] };
    const iso: CameraPose = { position: [10, -10, 8.5], target: [0, 0, 0], up: [0, 0, 1] };
    expectVec(interpolatePose(side, iso, 1).up, [0, 0, 1]);
  });
});

describe("basePlaneTarget", () => {
  const bounds = { min: [0, 0, 0] as Vec3, max: [20, 10, 4] as Vec3 };

  it("плоскости смотрят как виды ViewCube: XY сверху, XZ спереди, YZ справа", () => {
    expect(basePlaneTarget("XY", bounds).normal).toEqual([0, 0, 1]);
    expect(basePlaneTarget("XZ", bounds).normal).toEqual([0, -1, 0]);
    expect(basePlaneTarget("YZ", bounds).normal).toEqual([1, 0, 0]);
  });

  it("вписывает габарит модели", () => {
    const target = basePlaneTarget("XY", bounds);
    expect(target.center).toEqual([10, 5, 2]);
    expect(target.radius).toBeCloseTo(Math.hypot(20, 10, 4) / 2);
  });

  it("пустая сцена и точечный габарит не дают нулевой радиус", () => {
    expect(boundsSphere(null).radius).toBeGreaterThan(0);
    expect(boundsSphere({ min: [1, 1, 1], max: [1, 1, 1] }).radius).toBeGreaterThan(0);
  });
});
