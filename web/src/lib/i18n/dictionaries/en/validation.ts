import type { Translation } from "../../message";
import type { validation as source } from "../ru/validation";

export const validation: Translation<typeof source> = {
  "validation.email.required": "Enter your email address.",
  "validation.email.invalid": "That looks like a typo — check the email address.",
  "validation.password.required": "Enter your password.",
  "validation.password.tooShort": {
    one: "The password must be at least {count} character long.",
    other: "The password must be at least {count} characters long.",
  },
  "validation.password.confirmRequired": "Repeat the password.",
  "validation.password.mismatch": "The passwords do not match.",
  "validation.consent.required": "We can't create an account without your consent to personal data processing.",
};
