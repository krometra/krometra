import { formatBytes } from "@/lib/meshQuality";
import { LOCALE_HTML_LANG, type Locale } from "@/lib/i18n/locale";
import { translateAdminRu, type AdminTranslator } from "./i18n";

const GIB = 1024 ** 3;
const DAY_MS = 86_400_000;

export function formatStorage(bytes: number, locale: Locale = "ru"): string {
  if (locale === "ru") return bytes >= GIB ? `${(bytes / GIB).toFixed(1)} ГБ` : formatBytes(bytes);
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1);
  return `${(bytes / 1024 ** (index + 1)).toFixed(1)} ${units[index]}`;
}

export function formatCount(value: number, locale: Locale = "ru"): string {
  return new Intl.NumberFormat(LOCALE_HTML_LANG[locale]).format(value);
}

export function formatDate(iso: string | null | undefined, locale: Locale = "ru"): string {
  return iso ? new Intl.DateTimeFormat(LOCALE_HTML_LANG[locale], { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "—";
}

export function formatDay(isoDate: string, locale: Locale = "ru"): string {
  return new Intl.DateTimeFormat(LOCALE_HTML_LANG[locale], { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));
}

export function formatRelative(iso: string | null | undefined, now: Date = new Date(), locale: Locale = "ru", t: AdminTranslator = translateAdminRu): string {
  if (!iso) return "—";
  const then = new Date(iso);
  const days = Math.floor((startOfDay(now) - startOfDay(then)) / DAY_MS);
  if (days <= 0) return t("admin.today");
  if (days === 1) return t("admin.yesterday");
  if (days <= 30) return t("admin.daysAgo", { count: days });
  return formatDate(iso, locale);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function authMethodLabel(method: string, t: AdminTranslator = translateAdminRu): string {
  if (method === "password") return t("admin.password");
  if (method === "yandex") return t("admin.yandex");
  return ({ google: "Google", github: "GitHub" } as Record<string, string>)[method] ?? method;
}

export function formatAuthMethods(methods: string[], t: AdminTranslator = translateAdminRu): string {
  return methods.length ? methods.map((method) => authMethodLabel(method, t)).join(", ") : "—";
}
