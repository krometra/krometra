import { SOURCE_LOCALE, type Locale } from "./locale";
import { renderMessage, type Dictionary, type MessageValues } from "./message";

export type Catalog = Readonly<Partial<Record<Locale, Dictionary>>>;

export function translate(catalog: Catalog, locale: Locale, key: string, values?: MessageValues): string {
  for (const candidate of new Set([locale, SOURCE_LOCALE])) {
    const dictionary = catalog[candidate];
    if (dictionary && Object.hasOwn(dictionary, key)) {
      return renderMessage(candidate, dictionary[key], values);
    }
  }
  return key;
}
