import { describe, expect, it } from "vitest";
import { defaultPatternForm, patternFormError, patternSpecOf, pickHint } from "./patternForm";

describe("форма массива", () => {
  it("по умолчанию — линейный массив из трёх тел вдоль X", () => {
    expect(patternSpecOf(defaultPatternForm())).toEqual({
      type: "linear", axis: { kind: "x" }, count: 3, spacing: 20, axis2: null, count2: 1, spacing2: 20,
    });
  });

  it("второе направление попадает в массив только когда включено", () => {
    const form = { ...defaultPatternForm(), secondDirection: true, count2: 4 };
    expect(patternSpecOf(form)).toMatchObject({ axis2: { kind: "y" }, count2: 4 });
    expect(patternFormError("body-a", { ...form, axis2: null }, "join")).toContain("второе направление");
  });

  it("круговой массив берёт ось и угол", () => {
    const form = { ...defaultPatternForm(), type: "circular" as const, axis: { kind: "z" as const }, count: 6, angle: 180 };
    expect(patternSpecOf(form)).toEqual({ type: "circular", axis: { kind: "z" }, count: 6, angle: 180 });
  });

  it("объясняет, чего не хватает", () => {
    expect(patternFormError(null, defaultPatternForm(), "join")).toContain("тело");
    expect(patternFormError("body-a", { ...defaultPatternForm(), axis: null }, "join")).toContain("направление");
    expect(patternFormError("body-a", { ...defaultPatternForm(), type: "circular", axis: null }, "join")).toContain("ось");
    expect(patternFormError("body-a", { ...defaultPatternForm(), count: 1 }, "join")).toContain("от 2");
    expect(patternFormError("body-a", defaultPatternForm(), "separate")).toBeNull();
  });

  it("подсказка выбора зависит от того, что выбирают", () => {
    expect(pickHint("edge", "axis", "linear")).toContain("ребро");
    expect(pickHint("face", "axis", "circular")).toContain("вокруг её оси");
    expect(pickHint("face", "axis2", "linear")).toContain("нормаль");
  });
});
