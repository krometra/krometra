import { describe, expect, it } from "vitest";
import { filletFailureMessage, largestWorkingRadius } from "./filletFailure";

describe("объяснение неудачного скругления", () => {
  it("находит наибольший работающий радиус бинарным поиском", () => {
    const tried: number[] = [];
    const fits = largestWorkingRadius(20, (radius) => {
      tried.push(radius);
      return radius <= 7;
    });
    expect(tried).toEqual([10, 5, 7.5, 6.25]);
    expect(fits).toBe(6.25);
  });

  it("не находит радиус, если не строится ничего", () => {
    expect(largestWorkingRadius(1, () => false)).toBeNull();
    expect(largestWorkingRadius(0.08, () => true)).toBeNull();
  });

  it("подсказывает, сколько помещается", () => {
    expect(filletFailureMessage(20, 1, 6.25)).toBe(
      "Скругление радиусом 20 мм на этом ребре не строится: соседняя геометрия не оставила места. Здесь помещается примерно 6.3 мм.",
    );
    expect(filletFailureMessage(2.5, 3, 1)).toContain("на выбранных рёбрах (3)");
  });

  it("объясняет, когда не помещается ни один радиус", () => {
    expect(filletFailureMessage(5, 1, null)).toMatch(/^Скругление на этом ребре не строится ни при каком радиусе/);
  });
});
