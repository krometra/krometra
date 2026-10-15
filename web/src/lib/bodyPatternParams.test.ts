import { describe, expect, it } from "vitest";
import type { CircularPatternSpec, LinearPatternSpec } from "./bodyPattern";
import {
  axisRefFromParams,
  axisRefLabel,
  patternLabel,
  patternModeOf,
  patternParamRows,
  patternSpecFromParams,
  patternTimelineParams,
} from "./bodyPatternParams";

const grid: LinearPatternSpec = {
  type: "linear",
  axis: { kind: "edge", bodyId: "body-aaaaaaaaaaaa", name: "e-1" },
  count: 2,
  spacing: 30,
  axis2: { kind: "y" },
  count2: 2,
  spacing2: 20,
};

const ring: CircularPatternSpec = { type: "circular", axis: { kind: "face", bodyId: "body-bbbbbbbbbbbb", name: "f-1" }, count: 6, angle: 360 };

describe("параметры массива в истории", () => {
  it("линейный массив переживает запись в timeline и чтение обратно", () => {
    const params = patternTimelineParams(grid, "join");
    expect(params).toEqual({
      pattern_type: "linear", mode: "join", count: 2, spacing: 30, count2: 2, spacing2: 20,
      axis: { kind: "edge", body_id: "body-aaaaaaaaaaaa", name: "e-1" }, axis2: { kind: "y" },
    });
    expect(patternSpecFromParams(params)).toEqual(grid);
    expect(patternModeOf(params)).toBe("join");
  });

  it("круговой массив хранит угол без полей шага", () => {
    const params = patternTimelineParams(ring, "separate");
    expect(params).toEqual({
      pattern_type: "circular", mode: "separate", count: 6, angle: 360,
      axis: { kind: "face", body_id: "body-bbbbbbbbbbbb", name: "f-1" },
    });
    expect(patternSpecFromParams(params)).toEqual(ring);
    expect(patternModeOf(params)).toBe("separate");
  });

  it("произвольная ось и мусор в параметрах", () => {
    const custom = { kind: "custom", origin: [1, 2, 3], direction: [0, 0, 1] };
    expect(axisRefFromParams(custom)).toEqual(custom);
    expect(axisRefFromParams({ kind: "plane" })).toBeNull();
    expect(axisRefFromParams(null)).toBeNull();
    expect(patternSpecFromParams({})).toEqual({
      type: "linear", axis: { kind: "x" }, count: 2, spacing: 10, axis2: null, count2: 1, spacing2: 10,
    });
  });
});

describe("подписи массива", () => {
  const bodyLabel = (bodyId: string) => (bodyId === "body-aaaaaaaaaaaa" ? "Плита" : "Втулка");

  it("подписывает оси и сводку", () => {
    expect(axisRefLabel({ kind: "z" }, bodyLabel)).toBe("ось Z");
    expect(axisRefLabel(grid.axis, bodyLabel)).toBe("ребро Плита");
    expect(axisRefLabel(null, bodyLabel)).toBe("—");
    expect(patternLabel(grid, "join")).toBe("Линейный массив: 2×2 шт. · шаг 30 мм");
    expect(patternLabel(ring, "separate")).toBe("Круговой массив: 6 шт. · 360°, отдельные тела");
  });

  it("строки свойств показывают второе направление только когда оно действует", () => {
    const rows = patternParamRows(patternTimelineParams(grid, "join"), bodyLabel);
    expect(rows.map((row) => row.label)).toContain("Шаг 2");
    const single = patternParamRows(patternTimelineParams({ ...grid, count2: 1 }, "join"), bodyLabel);
    expect(single.map((row) => row.label)).not.toContain("Шаг 2");
    const circular = patternParamRows(patternTimelineParams(ring, "separate"), bodyLabel);
    expect(circular).toContainEqual({ label: "Ось", value: "грань Втулка" });
    expect(circular).toContainEqual({ label: "Результат", value: "Отдельные тела" });
  });
});
