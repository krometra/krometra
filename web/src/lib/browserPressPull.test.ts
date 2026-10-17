import { describe, expect, it } from "vitest";
import {
  axialLevels,
  formatSignedMm,
  isPressPullSurface,
  pressPullLabel,
  pressPullOperation,
  pressPullParamsError,
  pressPullVolumeChanged,
  tubeRadii,
  unsupportedSurfaceMessage,
} from "./browserPressPull";

describe("pressPullParamsError", () => {
  it("пропускает знаковое смещение с уникальными гранями", () => {
    expect(pressPullParamsError({ faceNames: ["f-a", "f-b"], distance: -0.07 })).toBeNull();
    expect(pressPullParamsError({ faceNames: ["f-a"], distance: 5 })).toBeNull();
  });

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY, 1e-6])("отклоняет смещение %s", (distance) => {
    expect(pressPullParamsError({ faceNames: ["f-a"], distance })).toMatch(/не может быть нулевым/);
  });

  it("требует грани без повторов", () => {
    expect(pressPullParamsError({ faceNames: [], distance: 1 })).toMatch(/хотя бы одну грань/);
    expect(pressPullParamsError({ faceNames: ["f-a", "f-a"], distance: 1 })).toMatch(/не должны повторяться/);
    expect(pressPullParamsError({ faceNames: Array.from({ length: 65 }, (_, index) => `f-${index}`), distance: 1 })).toMatch(/не больше 64/);
  });
});

describe("знак смещения", () => {
  it("плюс добавляет материал, минус вырезает", () => {
    expect(pressPullOperation(5)).toBe("union");
    expect(pressPullOperation(-0.07)).toBe("subtract");
  });

  it("объём должен измениться в сторону знака", () => {
    expect(pressPullVolumeChanged(4000, 6000, 5)).toBe(true);
    expect(pressPullVolumeChanged(4000, 3972, -0.07)).toBe(true);
    expect(pressPullVolumeChanged(4000, 4000, 5)).toBe(false);
    expect(pressPullVolumeChanged(4000, 4100, -1)).toBe(false);
    expect(pressPullVolumeChanged(4000, 0, -20)).toBe(false);
    expect(pressPullVolumeChanged(4000, Number.NaN, 1)).toBe(false);
  });

  it("подпись показывает знак", () => {
    expect(formatSignedMm(0.07)).toBe("+0.07");
    expect(formatSignedMm(-0.07)).toBe("-0.07");
    expect(pressPullLabel(5, false)).toBe("Сдвиг грани +5мм");
    expect(pressPullLabel(-2, true)).toBe("Выдавить грань -2мм");
  });
});

describe("поддержка граней", () => {
  it("плоские и цилиндрические грани поддерживаются", () => {
    expect(isPressPullSurface("PLANE")).toBe(true);
    expect(isPressPullSurface("CYLINDRE")).toBe(true);
    expect(isPressPullSurface("CONE")).toBe(false);
  });

  it("ошибка называет тип неподдержанной грани по-русски", () => {
    expect(unsupportedSurfaceMessage("SPHERE")).toMatch(/сферическая/);
    expect(unsupportedSurfaceMessage("WHATEVER")).toMatch(/криволинейная/);
  });
});

describe("цилиндрическая полоса", () => {
  it("находит ровно два уровня по оси", () => {
    expect(axialLevels([10, 0, 0.000001, 10, 0, 10], 1e-5)).toEqual([0, 10]);
    expect(axialLevels([0, 0, 0], 1e-5)).toBeNull();
    expect(axialLevels([0, 5, 10], 1e-5)).toBeNull();
  });

  it("радиусы трубки: наружная грань растёт по плюсу, стенка отверстия сужается", () => {
    expect(tubeRadii(5, true, 1)).toEqual({ inner: 5, outer: 6 });
    expect(tubeRadii(5, true, -1)).toEqual({ inner: 4, outer: 5 });
    expect(tubeRadii(4, false, 1)).toEqual({ inner: 3, outer: 4 });
    expect(tubeRadii(4, false, -1)).toEqual({ inner: 4, outer: 5 });
    expect(tubeRadii(4, false, 4)).toBeNull();
  });
});
