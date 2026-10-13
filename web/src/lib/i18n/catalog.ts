import { ru } from "./dictionaries/ru";
import { SOURCE_LOCALE, type Locale } from "./locale";
import type { Dictionary, MessageArgs, MessageValues } from "./message";
import type { Catalog } from "./translate";

export type Messages = typeof ru;

export type MessageKey = keyof Messages;

export type MessageKeyArgs<Key extends MessageKey> = MessageArgs<Messages[Key]>;

export interface MessageDescriptor {
  readonly key: MessageKey;
  readonly values?: MessageValues;
}

export function msg<Key extends MessageKey>(key: Key, ...args: MessageKeyArgs<Key>): MessageDescriptor {
  return { key, values: args[0] };
}

export const SOURCE_CATALOG: Catalog = { [SOURCE_LOCALE]: ru };

const LOADERS: Record<Locale, () => Promise<Dictionary>> = {
  ru: async () => ru,
  en: async () => (await import("./dictionaries/en")).en,
  zh: async () => (await import("./dictionaries/zh")).zh,
};

export function loadDictionary(locale: Locale): Promise<Dictionary> {
  return LOADERS[locale]();
}
