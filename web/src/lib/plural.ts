import { selectPluralForm } from "./i18n/message";

export function plural(n: number, one: string, few: string, many: string): string {
  return selectPluralForm("ru", { one, few, many, other: many }, n);
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  return `${n} ${plural(n, one, few, many)}`;
}
