import { describe, expect, it } from "vitest";
import { combineToolIds, cutTargetIds } from "./combineParams";

describe("инструменты Combine в канале управления", () => {
  it("складывает toolBodyId и toolBodyIds без повторов", () => {
    expect(combineToolIds("t", "a", undefined)).toEqual(["a"]);
    expect(combineToolIds("t", "a", ["b", "a", "c"])).toEqual(["a", "b", "c"]);
    expect(combineToolIds("t", undefined, ["b", "c"])).toEqual(["b", "c"]);
  });

  it("требует хотя бы один инструмент, отличный от цели", () => {
    expect(() => combineToolIds("t", undefined, undefined)).toThrow("хотя бы одно");
    expect(() => combineToolIds("t", undefined, ["a", "t"])).toThrow("разными");
  });
});

describe("цели выреза в канале управления", () => {
  it("без списка оставляет одиночную цель, список убирает повторы", () => {
    expect(cutTargetIds("cut", "a", undefined)).toBeUndefined();
    expect(cutTargetIds("cut", undefined, ["a", "b", "a"])).toEqual(["a", "b"]);
  });

  it("список допустим только для выреза и не вместе с targetBodyId", () => {
    expect(() => cutTargetIds("join", undefined, ["a"])).toThrow("только для operation = cut");
    expect(() => cutTargetIds(undefined, undefined, ["a"])).toThrow("только для operation = cut");
    expect(() => cutTargetIds("cut", "a", ["b"])).toThrow("либо targetBodyId");
  });
});
