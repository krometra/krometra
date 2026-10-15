import { describe, expect, it } from "vitest";
import {
  areParallel,
  circularStepAngle,
  globalAxisLine,
  MAX_SEPARATE_PATTERN_INSTANCES,
  patternError,
  patternInstanceCount,
  patternInstances,
  patternReferenceBodies,
  patternTransforms,
  type CircularPatternSpec,
  type LinearPatternSpec,
} from "./bodyPattern";

const linear = (patch: Partial<LinearPatternSpec> = {}): LinearPatternSpec => ({
  type: "linear", axis: { kind: "x" }, count: 3, spacing: 10, axis2: null, count2: 1, spacing2: 10, ...patch,
});

const circular = (patch: Partial<CircularPatternSpec> = {}): CircularPatternSpec => ({
  type: "circular", axis: { kind: "z" }, count: 4, angle: 360, ...patch,
});

describe("линейный массив", () => {
  it("сдвигает экземпляры вдоль нормированного направления на шаг", () => {
    const transforms = patternTransforms(linear(), { axis: { origin: [5, 5, 5], direction: [2, 0, 0] }, axis2: null });
    expect(transforms.map((transform) => transform.translate)).toEqual([[10, 0, 0], [20, 0, 0]]);
    expect(transforms.every((transform) => transform.rotate === null)).toBe(true);
  });

  it("отрицательный шаг разворачивает направление", () => {
    const [first] = patternTransforms(linear({ count: 2, spacing: -4 }), { axis: globalAxisLine("y"), axis2: null });
    expect(first.translate).toEqual([0, -4, 0]);
  });

  it("сетка 2×2 даёт три копии, исходное тело не повторяется", () => {
    const spec = linear({ count: 2, spacing: 30, axis2: { kind: "y" }, count2: 2, spacing2: 20 });
    const transforms = patternTransforms(spec, { axis: globalAxisLine("x"), axis2: globalAxisLine("y") });
    expect(transforms.map((transform) => transform.translate)).toEqual([[30, 0, 0], [0, 20, 0], [30, 20, 0]]);
    expect(patternInstanceCount(spec)).toBe(4);
  });

  it("второе направление с одним рядом не умножает количество", () => {
    const spec = linear({ axis2: { kind: "y" }, count2: 1 });
    expect(patternInstanceCount(spec)).toBe(3);
    expect(patternTransforms(spec, { axis: globalAxisLine("x"), axis2: globalAxisLine("y") })).toHaveLength(2);
  });
});

describe("экземпляры для построения", () => {
  it("объединённый массив строится одним запросом, отдельные тела — запросом на копию", () => {
    expect(patternInstances(linear(), "join")).toEqual([null]);
    expect(patternInstances(linear(), "separate")).toEqual([1, 2]);
    expect(patternInstances(circular({ count: 2 }), "separate")).toEqual([1]);
  });
});

describe("круговой массив", () => {
  it("полный оборот делит 360° на количество", () => {
    expect(circularStepAngle(4, 360)).toBe(90);
    const transforms = patternTransforms(circular(), { axis: { origin: [1, 2, 0], direction: [0, 0, 5] }, axis2: null });
    expect(transforms.map((transform) => transform.rotate?.angle)).toEqual([90, 180, 270]);
    expect(transforms[0].rotate).toEqual({ axis: [0, 0, 1], angle: 90, origin: [1, 2, 0] });
  });

  it("неполный угол ставит крайние экземпляры на его концы", () => {
    expect(circularStepAngle(3, 90)).toBe(45);
    const transforms = patternTransforms(circular({ count: 3, angle: 90 }), { axis: globalAxisLine("z"), axis2: null });
    expect(transforms.map((transform) => transform.rotate?.angle)).toEqual([45, 90]);
  });
});

describe("проверка параметров массива", () => {
  it("принимает корректные массивы", () => {
    expect(patternError(linear(), "join")).toBeNull();
    expect(patternError(circular({ angle: 120, count: 2 }), "separate")).toBeNull();
  });

  it.each([
    [linear({ count: 1 }), "от 2"],
    [linear({ count: 2.5 }), "от 2"],
    [linear({ spacing: 0 }), "нулевым"],
    [linear({ count2: 2, axis2: null }), "направление"],
    [linear({ count2: 2, axis2: { kind: "y" }, spacing2: 0 }), "втором направлении"],
    [circular({ angle: 0 }), "360"],
    [circular({ angle: 361 }), "360"],
    [linear({ axis: { kind: "custom", origin: [0, 0, 0], direction: [0, 0, 0] } }), "нулевой длины"],
    [linear({ axis: { kind: "edge", bodyId: "", name: "e-1" } }), "ребро или грань"],
  ])("отклоняет %j", (spec, message) => {
    expect(patternError(spec, "join")).toContain(message);
  });

  it("ограничивает число отдельных тел строже, чем объединённых", () => {
    const spec = linear({ count: MAX_SEPARATE_PATTERN_INSTANCES + 1 });
    expect(patternError(spec, "join")).toBeNull();
    expect(patternError(spec, "separate")).toContain(String(MAX_SEPARATE_PATTERN_INSTANCES));
    expect(patternError(linear({ count: 101 }), "join")).toContain("100");
  });
});

describe("опорные тела и параллельность", () => {
  it("собирает тела рёбер и граней без повторов, второе направление — только когда оно действует", () => {
    const edge = { kind: "edge" as const, bodyId: "body-a", name: "e-1" };
    const face = { kind: "face" as const, bodyId: "body-b", name: "f-1" };
    expect(patternReferenceBodies(linear({ axis: edge, axis2: face, count2: 2 }))).toEqual(["body-a", "body-b"]);
    expect(patternReferenceBodies(linear({ axis: edge, axis2: face, count2: 1 }))).toEqual(["body-a"]);
    expect(patternReferenceBodies(circular({ axis: { ...face, bodyId: "body-a" } }))).toEqual(["body-a"]);
    expect(patternReferenceBodies(circular())).toEqual([]);
  });

  it("узнаёт параллельные и противоположные направления", () => {
    expect(areParallel([1, 0, 0], [-3, 0, 0])).toBe(true);
    expect(areParallel([1, 0, 0], [1, 1, 0])).toBe(false);
  });
});
