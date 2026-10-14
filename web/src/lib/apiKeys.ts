import { msg, type MessageDescriptor } from "./i18n/catalog";
import type { ApiKey, ApiKeyCreated } from "@/types/api";

export const API_KEY_LIMIT = 10;
export const API_KEY_NAME_MAX = 100;

export function validateKeyName(value: string): MessageDescriptor | null {
  const trimmed = value.trim();
  if (!trimmed) return msg("account.keys.name.required");
  if (trimmed.length > API_KEY_NAME_MAX) return msg("account.keys.name.tooLong", { count: API_KEY_NAME_MAX });
  return null;
}

export function withoutSecret(created: ApiKeyCreated): ApiKey {
  const { key: _key, ...listed } = created;
  return listed;
}

export function isAtKeyLimit(keys: readonly ApiKey[]): boolean {
  return keys.length >= API_KEY_LIMIT;
}
