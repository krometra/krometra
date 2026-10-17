import { describe, expect, it } from "vitest";
import { buildChart, CHART_PADDING, labelIndices, niceStep, yScale } from "./chart";

const formatDay = (day: string) => day.slice(5);

describe("niceStep", () => {
  it("округляет шаг до 1, 2, 5 с порядком", () => {
    expect(niceStep(0.3)).toBe(1);
    expect(niceStep(1.4)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(23)).toBe(50);
  });
});

describe("yScale", () => {
  it("даёт ось хотя бы в один шаг на пустых данных", () => {
    expect(yScale(0)).toEqual({ max: 1, step: 1 });
  });

  it("накрывает максимум целым числом шагов", () => {
    expect(yScale(17)).toEqual({ max: 20, step: 5 });
  });
});

describe("labelIndices", () => {
  it("прореживает подписи до лимита", () => {
    expect(labelIndices(5, 7)).toEqual([0, 1, 2, 3, 4]);
    expect(labelIndices(30, 7)).toEqual([0, 5, 10, 15, 20, 25]);
  });
});

describe("buildChart", () => {
  const days = ["2026-10-15", "2026-10-16", "2026-10-17"];
  const chart = buildChart({
    days,
    series: [{ key: "registrations", label: "Регистрации", values: [0, 2, 4] }],
    width: 240,
    height: 140,
    formatDay,
  });

  it("растягивает точки по ширине и высоте рабочей области", () => {
    const [line] = chart.lines;
    expect(line.points.map((p) => p.x)).toEqual([CHART_PADDING.left, 132, 224]);
    expect(line.points[0].y).toBe(chart.box.bottom);
    expect(line.points[2].y).toBe(chart.box.top);
    expect(line.path.startsWith("M40.0 112.0 L")).toBe(true);
  });

  it("делает деления оси от нуля до максимума", () => {
    expect(chart.ticks.map((t) => t.value)).toEqual([0, 1, 2, 3, 4]);
  });

  it("подписывает столбцы значениями всех рядов", () => {
    expect(chart.columns[1].title).toBe("10-16\nРегистрации: 2");
    expect(chart.labels.map((l) => l.text)).toEqual(["10-15", "10-16", "10-17"]);
  });

  it("ставит единственную точку по центру", () => {
    const single = buildChart({ days: ["2026-10-17"], series: [{ key: "a", label: "A", values: [3] }], width: 240, height: 140, formatDay });
    expect(single.lines[0].points[0].x).toBe(132);
  });
});
