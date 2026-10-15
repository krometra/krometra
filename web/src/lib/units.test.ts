import { describe, expect, it } from "vitest";
import { findUnit, parameterQuantities, quantityInUnit } from "./units";

describe("quantityInUnit", () => {
  it("переводит значение параметра в мм или градусы по его единице", () => {
    expect(quantityInUnit(12, "мм")).toEqual({ value: 12, dimension: "length" });
    expect(quantityInUnit(2, "cm")).toEqual({ value: 20, dimension: "length" });
    expect(quantityInUnit(1, "in")).toEqual({ value: 25.4, dimension: "length" });
    expect(quantityInUnit(30, "°")).toEqual({ value: 30, dimension: "angle" });
  });

  it("безразмерный или незнакомый параметр остаётся числом", () => {
    expect(quantityInUnit(4, "безразм.")).toEqual({ value: 4, dimension: null });
    expect(quantityInUnit(4, "")).toEqual({ value: 4, dimension: null });
  });
});

describe("parameterQuantities", () => {
  it("собирает параметры документа в величины по именам", () => {
    expect(
      parameterQuantities([
        { name: "width", value: 40, unit: "мм" },
        { name: "tilt", value: 68, unit: "°" },
        { name: "count", value: 3, unit: "безразм." },
      ]),
    ).toEqual({
      width: { value: 40, dimension: "length" },
      tilt: { value: 68, dimension: "angle" },
      count: { value: 3, dimension: null },
    });
  });
});

describe("findUnit", () => {
  it("не путает единицы со свойствами объекта", () => {
    expect(findUnit("constructor")).toBeNull();
    expect(findUnit("__proto__")).toBeNull();
  });

  it("не зависит от регистра", () => {
    expect(findUnit("DEG")).toEqual({ dimension: "angle", factor: 1 });
  });
});
