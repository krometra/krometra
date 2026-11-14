import type { ErrorTranslator } from "./apiError";
import type { errors } from "./i18n/dictionaries/ru/errors";

type ErrorKey = keyof typeof errors;

const FIELD_KEYS: Record<string, ErrorKey> = {
  email: "errors.fieldEmail", username: "errors.fieldEmail", password: "errors.fieldPassword",
  new_password: "errors.fieldNewPassword", current_password: "errors.fieldCurrentPassword",
  display_name: "errors.fieldDisplayName", name: "errors.fieldName", description: "errors.fieldDescription",
  radius: "errors.fieldRadius", distance: "errors.fieldDistance", distance1: "errors.fieldDistance1",
  distance2: "errors.fieldDistance2", angle: "errors.fieldAngle",
};

const STATUS_KEYS: Record<number, ErrorKey> = {
  400: "errors.status400", 401: "errors.status401", 403: "errors.status403", 404: "errors.status404",
  409: "errors.status409", 413: "errors.status413", 429: "errors.status429", 500: "errors.status500",
  502: "errors.status502", 503: "errors.status503", 504: "errors.status504",
};

const RULES: { pattern: RegExp; key: ErrorKey }[] = [
  { pattern: /valid email/i, key: "errors.invalidEmail" },
  { pattern: /field required/i, key: "errors.required" },
  { pattern: /at least (\d+) characters?/i, key: "errors.minLength" },
  { pattern: /at most (\d+) characters?/i, key: "errors.maxLength" },
  { pattern: /greater than or equal to (\S+)/i, key: "errors.greaterEqual" },
  { pattern: /greater than (\S+)/i, key: "errors.greater" },
  { pattern: /less than or equal to (\S+)/i, key: "errors.lessEqual" },
  { pattern: /valid (number|integer|float)/i, key: "errors.number" },
  { pattern: /should be a valid/i, key: "errors.invalid" },
];

export function localizedStatus(status: number, translate: ErrorTranslator): string | undefined {
  const key = STATUS_KEYS[status];
  return key ? translate(key) : undefined;
}

export function localizedValidation(field: string, raw: string, translate: ErrorTranslator): string {
  const labelKey = FIELD_KEYS[field];
  const label = labelKey ? translate(labelKey) : field || translate("errors.fieldValue");
  const valueError = raw.match(/^Value error, (.+)$/s);
  if (valueError) return valueError[1];
  for (const rule of RULES) {
    const match = raw.match(rule.pattern);
    if (match) return translate(rule.key, { label, value: match[1] ?? "" });
  }
  return raw ? `${label}: ${raw}` : translate("errors.invalid", { label });
}
