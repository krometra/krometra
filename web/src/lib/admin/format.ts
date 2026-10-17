import { formatBytes } from "@/lib/meshQuality";
import { pluralize } from "@/lib/plural";

const GIB = 1024 ** 3;
const DAY_MS = 86_400_000;

const AUTH_METHOD_LABELS: Record<string, string> = {
  password: "Пароль",
  yandex: "Яндекс",
  google: "Google",
  github: "GitHub",
};

const countFormat = new Intl.NumberFormat("ru-RU");
const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });
const dayFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });

export function formatStorage(bytes: number): string {
  return bytes >= GIB ? `${(bytes / GIB).toFixed(1)} ГБ` : formatBytes(bytes);
}

export function formatCount(value: number): string {
  return countFormat.format(value);
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFormat.format(new Date(iso)) : "—";
}

export function formatDay(isoDate: string): string {
  return dayFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const then = new Date(iso);
  const days = Math.floor((startOfDay(now) - startOfDay(then)) / DAY_MS);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days <= 30) return `${pluralize(days, "день", "дня", "дней")} назад`;
  return formatDate(iso);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function authMethodLabel(method: string): string {
  return AUTH_METHOD_LABELS[method] ?? method;
}

export function formatAuthMethods(methods: string[]): string {
  return methods.length ? methods.map(authMethodLabel).join(", ") : "—";
}
