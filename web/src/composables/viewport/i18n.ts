import { viewportText } from "@/lib/i18n/dictionaries/ru/viewportText";
import type { MessageKeyArgs } from "@/lib/i18n/catalog";
import { renderMessage } from "@/lib/i18n/message";

type ViewportKey = keyof typeof viewportText;
export type ViewportTranslator = <Key extends ViewportKey>(key: Key, ...args: MessageKeyArgs<Key>) => string;
export const translateViewportRu: ViewportTranslator = (key, ...args) => renderMessage("ru", viewportText[key], args[0]);
