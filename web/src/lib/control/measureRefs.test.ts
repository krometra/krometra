import { describe, expect, it } from "vitest";
import { measureTarget, readMeasureRef } from "./measureRefs";
import { INVALID, param, parseParams } from "./params";

describe("readMeasureRef", () => {
  it("вид объекта следует из названного поля", () => {
    expect(readMeasureRef({ bodyId: "b1" })).toEqual({ kind: "body", bodyId: "b1" });
    expect(readMeasureRef({ bodyId: "b1", faceId: "f-1" })).toEqual({ kind: "face", bodyId: "b1", faceId: "f-1" });
    expect(readMeasureRef({ bodyId: "b1", edgeId: 7 })).toEqual({ kind: "edge", bodyId: "b1", edgeId: "7" });
    expect(readMeasureRef({ bodyId: "b1", point: [1, 2, 3] })).toEqual({ kind: "vertex", bodyId: "b1", point: [1, 2, 3] });
  });

  it("отклоняет неоднозначный, неполный и лишний ввод", () => {
    expect(readMeasureRef({ faceId: "f-1" })).toBe(INVALID);
    expect(readMeasureRef({ bodyId: "b1", faceId: "f-1", edgeId: "e-1" })).toBe(INVALID);
    expect(readMeasureRef({ bodyId: "b1", point: [1, 2] })).toBe(INVALID);
    expect(readMeasureRef({ bodyId: "b1", faceId: "" })).toBe(INVALID);
    expect(readMeasureRef({ bodyId: "b1", vertexId: "v-1" })).toBe(INVALID);
  });
});

describe("measureTarget", () => {
  it("разбирается как список параметров канала с русской ошибкой", () => {
    const schema = { targets: param.list(measureTarget("Объект."), "Объекты.") };
    expect(parseParams(schema, { targets: [{ bodyId: "b1" }, { bodyId: "b2", edgeId: "e" }] }).targets).toHaveLength(2);
    expect(() => parseParams(schema, { targets: [{ bodyId: "b1", faceId: 1, edgeId: 2 }] })).toThrow(/не больше одного из faceId, edgeId, point/);
  });
});
