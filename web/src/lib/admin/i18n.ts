import { admin } from "@/lib/i18n/dictionaries/ru/admin";
import { renderMessage } from "@/lib/i18n/message";
import type { MessageKeyArgs } from "@/lib/i18n/catalog";

export type AdminKey = keyof typeof admin;
export type AdminTranslator = <Key extends AdminKey>(key: Key, ...args: MessageKeyArgs<Key>) => string;

export const translateAdminRu: AdminTranslator = (key, ...args) => renderMessage("ru", admin[key], args[0]);
