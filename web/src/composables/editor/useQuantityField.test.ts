import { describe, expect, it } from "vitest";
import type { Quantity } from "@/lib/units";
import { useQuantityField } from "./useQuantityField";

function lengthField(variables: Record<string, Quantity> = {}) {
  return useQuantityField({
    dimension: "length",
    initial: 30,
    variables: () => variables,
    rangeError: (value) => (value > 0 ? null : "Расстояние должно быть больше нуля"),
  });
}

describe("useQuantityField", () => {
  it("показывает начальное значение без хвоста нулей", () => {
    const field = lengthField();
    expect(field.text.value).toBe("30");
    expect(field.value.value).toBe(30);
    expect(field.invalid.value).toBe(false);
  });

  it("применяет выражение с единицами на каждый ввод, не переписывая текст", () => {
    const field = lengthField();
    field.text.value = "1in + 2mm";
    field.onInput();
    expect(field.value.value).toBeCloseTo(27.4, 9);
    expect(field.text.value).toBe("1in + 2mm");
  });

  it("берёт параметры с их единицами", () => {
    const field = lengthField({ width: { value: 40, dimension: "length" } });
    field.text.value = "width/2 + 5 mm";
    field.onInput();
    expect(field.value.value).toBe(25);
  });

  it("на ошибке держит прошлое значение и отдаёт текст ошибки", () => {
    const field = lengthField();
    field.text.value = "90 deg";
    field.onInput();
    expect(field.invalid.value).toBe(true);
    expect(field.error.value).toBe("Это поле длины: нужны mm, cm, m, in, а не единицы угла");
    expect(field.value.value).toBe(30);
  });

  it("проверяет допустимый диапазон уже вычисленного значения", () => {
    const field = lengthField();
    field.text.value = "1 cm - 2 cm";
    field.onInput();
    expect(field.error.value).toBe("Расстояние должно быть больше нуля");
    expect(field.value.value).toBe(30);
  });

  it("при подтверждении заменяет выражение итогом в мм", () => {
    const field = lengthField();
    field.text.value = "1 in / 3";
    field.commit();
    expect(field.text.value).toBe("8.467");
  });

  it("при подтверждении с ошибкой оставляет набранный текст", () => {
    const field = lengthField();
    field.text.value = "5 ft";
    field.commit();
    expect(field.text.value).toBe("5 ft");
    expect(field.error.value).toBe("Неизвестная единица «ft»");
  });

  it("программная установка сбрасывает ошибку и текст", () => {
    const field = lengthField();
    field.text.value = "oops";
    field.onInput();
    field.set(12.5);
    expect(field.invalid.value).toBe(false);
    expect(field.text.value).toBe("12.5");
    expect(field.value.value).toBe(12.5);
  });
});
