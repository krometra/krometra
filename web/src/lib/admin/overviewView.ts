import type { AdminDailyPoint, AdminOperationStat, AdminOverview } from "@/types/api";
import type { ChartSeries } from "./chart";
import { formatCount, formatStorage } from "./format";
import { operationLabel } from "./operationLabels";
import { translateAdminRu, type AdminTranslator } from "./i18n";
import { LOCALE_HTML_LANG, type Locale } from "@/lib/i18n/locale";

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

export function chartSeries(points: AdminDailyPoint[], t: AdminTranslator = translateAdminRu): ChartSeries[] {
  const series: { key: keyof Omit<AdminDailyPoint, "date">; label: string }[] = [
    { key: "registrations", label: t("admin.registrations") },
    { key: "projects", label: t("admin.newProjects") },
    { key: "active_users", label: t("admin.activeUsers") },
  ];
  return series.map(({ key, label }) => ({ key, label, values: points.map((point) => point[key]) }));
}

export function operationBars(stats: AdminOperationStat[], t: AdminTranslator = translateAdminRu): OperationBar[] {
  const max = Math.max(0, ...stats.map((s) => s.count));
  return [...stats]
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
    .map((s) => ({
      kind: s.kind,
      label: operationLabel(s.kind, t),
      count: s.count,
      projects: s.projects,
      periodCount: s.period_count,
      share: max ? s.count / max : 0,
    }));
}

export function kpiTiles(overview: AdminOverview, t: AdminTranslator = translateAdminRu, locale: Locale = "ru"): KpiTile[] {
  const { users, projects, api_keys: keys, period_days: days } = overview;
  const count = (value: number) => formatCount(value, locale);
  return [
    { id: "users", label: t("admin.users"), value: count(users.total), hint: t("admin.newUsersHint", { count: count(users.new), days }) },
    { id: "active", label: t("admin.active7"), value: count(users.active_7d), hint: t("admin.activeHint", { day: count(users.active_1d), month: count(users.active_30d) }) },
    { id: "projects", label: t("admin.projects"), value: count(projects.total), hint: t("admin.projectsHint", { bodies: count(projects.with_bodies), empty: count(projects.empty) }) },
    { id: "new-projects", label: t("admin.newProjectsPeriod", { days }), value: count(projects.new), hint: t("admin.avgOperations", { count: projects.avg_operations.toLocaleString(LOCALE_HTML_LANG[locale]) }) },
    { id: "storage", label: t("admin.storage"), value: formatStorage(projects.storage_bytes, locale), hint: t("admin.storageHint") },
    { id: "mcp", label: t("admin.mcpKeys"), value: count(keys.users), hint: t("admin.mcpHint", { count: count(keys.active_users) }) },
  ];
}
