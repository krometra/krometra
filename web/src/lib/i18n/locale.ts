export const LOCALES = ["ru", "en", "zh"] as const;

export type Locale = (typeof LOCALES)[number];

export const SOURCE_LOCALE: Locale = "ru";

export const LOCALE_NAMES: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
  zh: "中文",
};

export const LOCALE_HTML_LANG: Record<Locale, string> = {
  ru: "ru",
  en: "en",
  zh: "zh-Hans",
};

export function parseLocale(value: string | null | undefined): Locale | null {
  const primary = value?.trim().toLowerCase().split(/[-_]/)[0];
  return LOCALES.find((locale) => locale === primary) ?? null;
}

export function resolveInitialLocale(sources: {
  stored: string | null | undefined;
  envDefault: string | null | undefined;
}): Locale {
  return parseLocale(sources.stored) ?? parseLocale(sources.envDefault) ?? SOURCE_LOCALE;
}
