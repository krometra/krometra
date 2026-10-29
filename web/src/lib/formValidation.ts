import { msg, type MessageDescriptor } from "./i18n/catalog";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(value: string): MessageDescriptor | null {
  const trimmed = value.trim();
  if (!trimmed) return msg("validation.email.required");
  if (!EMAIL_PATTERN.test(trimmed)) return msg("validation.email.invalid");
  return null;
}

export function validatePasswordEntered(value: string): MessageDescriptor | null {
  return value ? null : msg("validation.password.required");
}

export function validatePassword(value: string): MessageDescriptor | null {
  const missing = validatePasswordEntered(value);
  if (missing) return missing;
  if (value.length < MIN_PASSWORD_LENGTH) {
    return msg("validation.password.tooShort", { count: MIN_PASSWORD_LENGTH });
  }
  return null;
}

export function validateConsent(given: boolean): MessageDescriptor | null {
  return given ? null : msg("validation.consent.required");
}

export function validatePasswordConfirmation(password: string, confirmation: string): MessageDescriptor | null {
  if (!confirmation) return msg("validation.password.confirmRequired");
  return confirmation === password ? null : msg("validation.password.mismatch");
}
