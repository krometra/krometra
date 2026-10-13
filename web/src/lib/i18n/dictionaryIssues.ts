import { placeholderNames, pluralCategories, type Dictionary, type Message } from "./message";

function valueNames(message: Message): string[] {
  if (typeof message === "string") return placeholderNames(message).sort();
  const names = new Set(["count", ...Object.values(message).flatMap(placeholderNames)]);
  return [...names].sort();
}

function describeNames(names: string[]): string {
  return names.length > 0 ? names.map((name) => `{${name}}`).join(", ") : "(нет)";
}

export function pluralFormIssues(locale: string, dictionary: Dictionary): string[] {
  const required = pluralCategories(locale);
  const issues: string[] = [];
  for (const [key, message] of Object.entries(dictionary)) {
    if (typeof message === "string") continue;
    const present = Object.keys(message);
    for (const category of required) {
      if (!present.includes(category)) issues.push(`[${locale}] "${key}": нет формы "${category}"`);
    }
    for (const category of present) {
      if (!(required as string[]).includes(category)) {
        issues.push(`[${locale}] "${key}": лишняя форма "${category}", локаль её не использует`);
      }
    }
  }
  return issues;
}

export function parityIssues(
  source: { locale: string; dictionary: Dictionary },
  target: { locale: string; dictionary: Dictionary },
): string[] {
  const issues: string[] = [];
  for (const [key, sourceMessage] of Object.entries(source.dictionary)) {
    if (!Object.hasOwn(target.dictionary, key)) {
      issues.push(`[${target.locale}] нет ключа "${key}"`);
      continue;
    }
    const targetMessage = target.dictionary[key];
    if (typeof sourceMessage !== typeof targetMessage) {
      issues.push(
        `[${target.locale}] "${key}": строка и формы множественного числа не совпадают с ${source.locale}`,
      );
      continue;
    }
    const expected = describeNames(valueNames(sourceMessage));
    const actual = describeNames(valueNames(targetMessage));
    if (expected !== actual) {
      issues.push(`[${target.locale}] "${key}": параметры ${actual}, в ${source.locale} ${expected}`);
    }
  }
  for (const key of Object.keys(target.dictionary)) {
    if (!Object.hasOwn(source.dictionary, key)) {
      issues.push(`[${target.locale}] лишний ключ "${key}", в ${source.locale} его нет`);
    }
  }
  return issues;
}
