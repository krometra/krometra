import { describe, expect, it } from "vitest";
import type { AdminOverview } from "@/types/api";
import { chartSeries, kpiTiles, operationBars } from "./overviewView";
import { operationLabel } from "./operationLabels";

const overview: AdminOverview = {
  period_days: 7,
  since: "2026-10-11T00:00:00Z",
  generated_at: "2026-10-17T12:00:00Z",
  users: { total: 12, new: 3, admins: 1, active_1d: 2, active_7d: 5, active_30d: 9 },
  projects: { total: 20, new: 4, storage_bytes: 5 * 1024 * 1024, with_bodies: 15, empty: 5, operations_total: 50, avg_operations: 2.5 },
  api_keys: { keys: 3, users: 2, active_users: 1 },
  operations: [
    { kind: "fillet", count: 5, projects: 2, period_count: 1 },
    { kind: "extrude", count: 20, projects: 10, period_count: 4 },
    { kind: "custom_op", count: 5, projects: 1, period_count: 0 },
  ],
  series: [
    { date: "2026-10-16", registrations: 1, projects: 2, active_users: 3, operations: 4 },
    { date: "2026-10-17", registrations: 0, projects: 1, active_users: 2, operations: 0 },
  ],
};

describe("overviewView", () => {
  it("строит ряды графика из точек по дням", () => {
    const series = chartSeries(overview.series);
    expect(series.map((s) => s.key)).toEqual(["registrations", "projects", "active_users"]);
    expect(series[0].values).toEqual([1, 0]);
  });

  it("сортирует бары по частоте и считает долю от лидера", () => {
    const bars = operationBars(overview.operations);
    expect(bars.map((b) => b.kind)).toEqual(["extrude", "custom_op", "fillet"]);
    expect(bars[0]).toMatchObject({ label: "Выдавливание", share: 1, periodCount: 4 });
    expect(bars[2]).toMatchObject({ label: "Скругление", share: 0.25 });
  });

  it("неизвестная операция подписывается своим кодом", () => {
    expect(operationLabel("custom_op")).toBe("custom_op");
    expect(operationLabel("press_pull")).toBe("Сдвиг грани");
  });

  it("собирает KPI с периодом в подписях", () => {
    const tiles = kpiTiles(overview);
    expect(tiles.find((t) => t.id === "users")).toMatchObject({ value: "12", hint: "+3 за 7 дн." });
    expect(tiles.find((t) => t.id === "storage")?.value).toBe("5.0 МБ");
    expect(tiles.find((t) => t.id === "projects")?.hint).toBe("с телами 15, пустых 5");
  });
});
