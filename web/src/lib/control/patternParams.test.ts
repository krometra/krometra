import { describe, expect, it } from "vitest";
import { parseParams } from "./params";
import { patternAxisParam, readPatternAxis } from "./patternParams";

describe("ось массива в канале управления", () => {
  it("понимает глобальные оси, ребро, грань и произвольную ось", () => {
    expect(readPatternAxis({ kind: "z" })).toEqual({ kind: "z" });
    expect(readPatternAxis({ kind: "edge", bodyId: "body-a", edgeId: "e-1" })).toEqual({ kind: "edge", bodyId: "body-a", name: "e-1" });
    expect(readPatternAxis({ kind: "face", bodyId: "body-a", faceId: 7 })).toEqual({ kind: "face", bodyId: "body-a", name: "7" });
    expect(readPatternAxis({ kind: "custom", origin: [1, 2, 3], direction: [0, 0, 2] })).toEqual({
      kind: "custom", origin: [1, 2, 3], direction: [0, 0, 2],
    });
  });

  it("отклоняет неполные и нулевые оси", () => {
    const schema = { axis: patternAxisParam("Ось.") };
    for (const axis of [{ kind: "w" }, { kind: "edge", bodyId: "body-a" }, { kind: "custom", origin: [0, 0, 0], direction: [0, 0, 0] }, "x"]) {
      expect(() => parseParams(schema, { axis })).toThrow("Параметр «axis»");
    }
  });
});
