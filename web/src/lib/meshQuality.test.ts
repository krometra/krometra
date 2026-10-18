import { describe, expect, it } from "vitest";
import {
  QUALITY_PRESETS,
  customQualityError,
  defaultQuality,
  explicitQuality,
  formatBytes,
  meshTolerance,
  parseQualityChoice,
  qualityValues,
  stlBytes,
} from "./meshQuality";

describe("meshQuality", () => {
  it("нормальный пресет совпадает с прежним жёстким допуском экспорта", () => {
    const tolerance = meshTolerance(QUALITY_PRESETS.normal);
    expect(tolerance.tolerance).toBe(0.01);
    expect(tolerance.angularTolerance).toBeCloseTo(0.5, 12);
  });

  it("пресеты упорядочены от грубого к точному", () => {
    expect(QUALITY_PRESETS.draft.tolerance).toBeGreaterThan(QUALITY_PRESETS.normal.tolerance);
    expect(QUALITY_PRESETS.normal.tolerance).toBeGreaterThan(QUALITY_PRESETS.high.tolerance);
    expect(QUALITY_PRESETS.normal.angleDeg).toBeGreaterThan(QUALITY_PRESETS.high.angleDeg);
  });

  it("берёт значения пресета или своё", () => {
    const custom = { tolerance: 0.05, angleDeg: 12 };
    expect(qualityValues({ preset: "high", custom })).toEqual(QUALITY_PRESETS.high);
    expect(qualityValues({ preset: "custom", custom })).toEqual(custom);
  });

  it("проверяет границы своего допуска", () => {
    expect(customQualityError({ tolerance: 0.05, angleDeg: 12 })).toBeNull();
    expect(customQualityError({ tolerance: 0, angleDeg: 12 })).toContain("Линейный");
    expect(customQualityError({ tolerance: Number.NaN, angleDeg: 12 })).toContain("Линейный");
    expect(customQualityError({ tolerance: 0.05, angleDeg: 120 })).toContain("Угловой");
  });

  it("восстанавливает сохранённый выбор и отбрасывает мусор", () => {
    const stored = JSON.stringify({ preset: "custom", custom: { tolerance: 0.2, angleDeg: 15 } });
    expect(parseQualityChoice(stored)).toEqual({ preset: "custom", custom: { tolerance: 0.2, angleDeg: 15 } });
    expect(parseQualityChoice(null)).toEqual(defaultQuality());
    expect(parseQualityChoice("{не json")).toEqual(defaultQuality());
    expect(parseQualityChoice(JSON.stringify({ preset: "ultra" }))).toEqual(defaultQuality());
    expect(parseQualityChoice(JSON.stringify({ preset: "draft", custom: { tolerance: -1, angleDeg: 5 } }))).toEqual({
      preset: "draft",
      custom: { tolerance: 0.01, angleDeg: 28.6 },
    });
  });

  it("округляет своё качество для поля ввода", () => {
    expect(defaultQuality().custom).toEqual({ tolerance: 0.01, angleDeg: 28.6 });
    const stored = JSON.stringify({ preset: "custom", custom: { tolerance: 0.012345, angleDeg: 28.64788975 } });
    expect(parseQualityChoice(stored).custom).toEqual({ tolerance: 0.0123, angleDeg: 28.6 });
  });

  it("собирает явный допуск поверх пресета", () => {
    expect(explicitQuality({})).toEqual(QUALITY_PRESETS.normal);
    expect(explicitQuality({ preset: "draft" })).toEqual(QUALITY_PRESETS.draft);
    expect(explicitQuality({ preset: "high", tolerance: 0.5 })).toEqual({ tolerance: 0.5, angleDeg: QUALITY_PRESETS.high.angleDeg });
  });

  it("оценивает размер бинарного STL и печатает его по-русски", () => {
    expect(stlBytes(0)).toBe(84);
    expect(stlBytes(12)).toBe(684);
    expect(formatBytes(684)).toBe("684 Б");
    expect(formatBytes(2048)).toBe("2.0 КБ");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 МБ");
  });
});
