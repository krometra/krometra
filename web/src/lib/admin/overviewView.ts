import type { AdminDailyPoint, AdminOperationStat, AdminOverview } from "@/types/api";
import type { ChartSeries } from "./chart";
import { formatCount, formatStorage } from "./format";
import { operationLabel } from "./operationLabels";

export interface OperationBar {
  kind: string;
  label: string;
  count: number;
  projects: number;
  periodCount: number;
  share: number;
}

export interface KpiTile {
  id: string;
  label: string;
  value: string;
  hint: string;
}

const SERIES: { key: keyof Omit<AdminDailyPoint, "date">; label: string }[] = [
  { key: "registrations", label: "Регистрации" },
  { key: "projects", label: "Новые проекты" },
  { key: "active_users", label: "Активные пользователи" },
];

export function chartSeries(points: AdminDailyPoint[]): ChartSeries[] {
  return SERIES.map(({ key, label }) => ({ key, label, values: points.map((point) => point[key]) }));
}

export function operationBars(stats: AdminOperationStat[]): OperationBar[] {
  const max = Math.max(0, ...stats.map((s) => s.count));
  return [...stats]
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
    .map((s) => ({
      kind: s.kind,
      label: operationLabel(s.kind),
      count: s.count,
      projects: s.projects,
      periodCount: s.period_count,
      share: max ? s.count / max : 0,
    }));
}

export function kpiTiles(overview: AdminOverview): KpiTile[] {
  const { users, projects, api_keys: keys, period_days: days } = overview;
  return [
    { id: "users", label: "Пользователи", value: formatCount(users.total), hint: `+${formatCount(users.new)} за ${days} дн.` },
    {
      id: "active",
      label: "Активные за 7 дней",
      value: formatCount(users.active_7d),
      hint: `за сутки ${formatCount(users.active_1d)}, за 30 дн. ${formatCount(users.active_30d)}`,
    },
    {
      id: "projects",
      label: "Проекты",
      value: formatCount(projects.total),
      hint: `с телами ${formatCount(projects.with_bodies)}, пустых ${formatCount(projects.empty)}`,
    },
    {
      id: "new-projects",
      label: `Новые проекты за ${days} дн.`,
      value: formatCount(projects.new),
      hint: `в среднем ${projects.avg_operations.toLocaleString("ru-RU")} операций на проект`,
    },
    { id: "storage", label: "Хранилище", value: formatStorage(projects.storage_bytes), hint: "STEP, сетки и превью" },
    {
      id: "mcp",
      label: "Ключи MCP",
      value: formatCount(keys.users),
      hint: `пользователей с ключами, ${formatCount(keys.active_users)} пользовались за период`,
    },
  ];
}
