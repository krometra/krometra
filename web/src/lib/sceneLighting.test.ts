import { describe, expect, it } from "vitest";
import type { Vec3 } from "./threadGeometry";
import { dot, magnitude, scale, subtract, unit } from "./vec3";
import {
  fillLightDirection,
  floorShadowVisible,
  floorZ,
  keyLightDirection,
  sameBounds,
  sameDirection,
  shadowRig,
  type Bounds3,
} from "./sceneLighting";

const Z_UP: Vec3 = [0, 0, 1];
const cube: Bounds3 = { min: [0, 0, 0], max: [10, 10, 10] };

function lookingFrom(position: Vec3): Vec3 {
  return unit(scale(position, -1))!;
}

function lambert(normal: Vec3, light: Vec3): number {
  return Math.max(dot(normal, light), 0);
}

function visibleFaces(forward: Vec3): Vec3[] {
  const normals: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  return normals.filter((normal) => dot(normal, forward) < -1e-6);
}

describe("keyLightDirection", () => {
  it("светит от зрителя, сверху и сбоку от камеры", () => {
    const forward = lookingFrom([1, 1, 1]);
    const light = keyLightDirection(forward, Z_UP);

    expect(magnitude(light)).toBeCloseTo(1, 9);
    expect(dot(light, scale(forward, -1))).toBeGreaterThan(0.7);
    expect(light[2]).toBeGreaterThan(dot([0, 0, 1], scale(forward, -1)));
  });

  it("в изометрии три видимые грани куба освещены заметно по-разному", () => {
    for (const position of [[1, 1, 1], [-1, -1, 1], [1, -1, 1], [-1, 1, 1]] as Vec3[]) {
      const forward = lookingFrom(position);
      const light = keyLightDirection(forward, Z_UP);
      const shades = visibleFaces(forward).map((normal) => lambert(normal, light)).sort((a, b) => a - b);

      expect(shades).toHaveLength(3);
      expect(shades[1] - shades[0]).toBeGreaterThan(0.2);
      expect(shades[2] - shades[1]).toBeGreaterThan(0.2);
    }
  });

  it("у вида сверху и снизу направление определено и обращено к зрителю", () => {
    for (const [forward, up] of [[[0, 0, -1], [0, 1, 0]], [[0, 0, 1], [0, 1, 0]], [[0, 0, -1], [0, 0, 1]]] as [Vec3, Vec3][]) {
      const light = keyLightDirection(forward, up);
      expect(light.every(Number.isFinite)).toBe(true);
      expect(dot(light, scale(forward, -1))).toBeGreaterThan(0.7);
    }
  });

  it("заполняющий свет приходит с другой стороны от ключевого", () => {
    const forward = lookingFrom([1, 1, 1]);
    const key = keyLightDirection(forward, Z_UP);
    const fill = fillLightDirection(forward, Z_UP);
    const right: Vec3 = [-Math.SQRT1_2, Math.SQRT1_2, 0];

    expect(Math.sign(dot(key, right))).toBe(-Math.sign(dot(fill, right)));
    expect(dot(fill, scale(forward, -1))).toBeGreaterThan(0.5);
  });
});

describe("shadowRig", () => {
  function frustumHolds(rig: ReturnType<typeof shadowRig>, light: Vec3, point: Vec3): boolean {
    const offset = subtract(point, rig.target);
    const along = dot(offset, light);
    const across = magnitude(subtract(offset, scale(light, along)));
    const depth = magnitude(subtract(rig.position, rig.target)) - along;
    return across <= rig.halfExtent + 1e-9 && depth >= rig.near && depth <= rig.far;
  }

  it("свет сверху: фрустум охватывает тело, свет смотрит в центр габарита", () => {
    const light: Vec3 = [0, 0, 1];
    const rig = shadowRig(cube, light, 2048);

    expect(rig.target).toEqual([5, 5, 5]);
    expect(rig.position[0]).toBeCloseTo(5, 9);
    expect(rig.position[2]).toBeGreaterThan(10);
    expect(rig.halfExtent).toBeCloseTo(Math.hypot(5, 5) * 1.05, 6);
    expect(rig.near).toBeGreaterThan(0);
    expect(rig.far - rig.near).toBeGreaterThan(10);
    expect(rig.normalBias).toBeCloseTo(((2 * rig.halfExtent) / 2048) * 1.5, 9);
  });

  it("косой свет: в фрустум попадают и тело, и его тень на полу", () => {
    const light = unit([1, 0.3, 1])!;
    const rig = shadowRig(cube, light, 2048);
    const floor = rig.floor.z;
    const shadowTips = [[0, 0, 10], [10, 10, 10], [0, 10, 10], [10, 0, 10]].map((corner) =>
      subtract(corner as Vec3, scale(light, ((corner[2] as number) - floor) / light[2])),
    );

    for (const point of [...[[0, 0, 0], [10, 10, 10], [0, 10, 0], [10, 0, 10]] as Vec3[], ...shadowTips]) {
      expect(frustumHolds(rig, light, point)).toBe(true);
    }
    expect(rig.halfExtent).toBeGreaterThan(Math.hypot(5, 5, 5));
  });

  it("скользящий свет не раздувает фрустум бесконечной тенью", () => {
    const light = unit([1, 0, 0.05])!;
    const rig = shadowRig(cube, light, 2048);

    expect(rig.halfExtent).toBeLessThan(Math.hypot(5, 5, 5) * 1.1);
  });

  it("пол лежит чуть ниже тела, по центру его габарита", () => {
    const rig = shadowRig({ min: [-20, 0, 4], max: [20, 10, 14] }, [0, 0, 1], 1024);

    expect(rig.floor.z).toBeLessThan(4);
    expect(rig.floor.z).toBeGreaterThan(3.9);
    expect(rig.floor.center).toEqual([0, 5]);
    expect(rig.floor.size).toBeGreaterThan(40);
    expect(floorZ({ min: [0, 0, 4], max: [1, 1, 5] })).toBeLessThan(4);
  });

  it("вырожденный габарит (точка) не даёт нулевого фрустума", () => {
    const rig = shadowRig({ min: [1, 1, 1], max: [1, 1, 1] }, [0, 0, 1], 2048);

    expect(rig.halfExtent).toBeGreaterThan(0);
    expect(rig.far).toBeGreaterThan(rig.near);
  });
});

describe("floorShadowVisible", () => {
  it("тень на полу видна, только когда свет сверху, а камера над полом", () => {
    expect(floorShadowVisible([0, 0, 1], 50, 0)).toBe(true);
    expect(floorShadowVisible([0, 0, 1], -5, 0)).toBe(false);
    expect(floorShadowVisible(unit([1, 0, 0.05])!, 50, 0)).toBe(false);
  });
});

describe("sameDirection и sameBounds", () => {
  it("мелкое дрожание камеры не считается изменением, поворот — считается", () => {
    expect(sameDirection([0, 0, 1], unit([0.001, 0, 1])!)).toBe(true);
    expect(sameDirection([0, 0, 1], unit([0.1, 0, 1])!)).toBe(false);
  });

  it("габарит сравнивается с допуском от размера", () => {
    expect(sameBounds(cube, { min: [0, 0, 0], max: [10, 10, 10.000001] })).toBe(true);
    expect(sameBounds(cube, { min: [0, 0, 0], max: [10, 10, 11] })).toBe(false);
  });
});
