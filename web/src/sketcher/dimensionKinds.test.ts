import { describe, expect, it } from "vitest";
import { dimensionQuantity, dimensionRangeError, dimensionText, isDimensionType } from "./dimensionKinds";

describe("dimensionKinds", () => {
  it("размерные типы отличаются от геометрических", () => {
    expect(isDimensionType("line_distance")).toBe(true);
    expect(isDimensionType("distance")).toBe(true);
    expect(isDimensionType("parallel")).toBe(false);
  });

  it("угол вводится как угол, остальное как длина", () => {
    expect(dimensionQuantity("angle")).toBe("angle");
    expect(dimensionQuantity("diameter")).toBe("length");
    expect(dimensionQuantity("horizontal_distance")).toBe("length");
  });

  it("длина, радиус и диаметр строго положительны, расстояния могут быть нулём", () => {
    expect(dimensionRangeError("length", 0)).toMatch(/больше нуля/);
    expect(dimensionRangeError("diameter", -1)).toMatch(/больше нуля/);
    expect(dimensionRangeError("line_distance", 0)).toBeNull();
    expect(dimensionRangeError("horizontal_distance", -2)).toMatch(/отрицательным/);
    expect(dimensionRangeError("angle", 75)).toBeNull();
    expect(dimensionRangeError("angle", 400)).toMatch(/360/);
  });

  it("подпись округляет до сотых и добавляет знак", () => {
    expect(dimensionText("length", 20.0049)).toBe("20");
    expect(dimensionText("diameter", 56.5)).toBe("⌀56.5");
    expect(dimensionText("radius", 3.456)).toBe("R3.46");
    expect(dimensionText("angle", 75)).toBe("75°");
  });
});
