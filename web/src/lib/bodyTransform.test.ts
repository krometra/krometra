import { describe, expect, it } from "vitest";
import { isIdentityTransform, transformLabel, transformParams } from "./bodyTransform";

describe("bodyTransform", () => {
  it("узнаёт пустое перемещение", () => {
    expect(isIdentityTransform({ translate: [0, 0, 0], rotate: null })).toBe(true);
    expect(isIdentityTransform({ translate: [0, 0, 0], rotate: { axis: [0, 0, 1], angle: 360, origin: [0, 0, 0] } })).toBe(true);
    expect(isIdentityTransform({ translate: [2.4, 0, 0], rotate: null })).toBe(false);
  });

  it("подписывает операцию сдвигом и поворотом", () => {
    expect(transformLabel({ translate: [2.4, 0, 0], rotate: { axis: [0, 0, 1], angle: 90, origin: [0, 0, 0] } }, false)).toBe(
      "Перемещение: сдвиг [2.4, 0, 0] мм, поворот 90°",
    );
    expect(transformLabel({ translate: [0, 0, 5], rotate: null }, true)).toBe("Копия: сдвиг [0, 0, 5] мм");
  });

  it("описывает параметры для панели свойств", () => {
    expect(transformParams({ translate: [1, 2, 3], rotate: null, copy: true })).toEqual([
      { label: "Тип", value: "Копия" },
      { label: "Сдвиг", value: "[1, 2, 3] мм" },
      { label: "Поворот", value: "—" },
    ]);
  });
});
