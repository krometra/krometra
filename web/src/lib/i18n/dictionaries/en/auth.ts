import type { Translation } from "../../message";
import type { auth as source } from "../ru/auth";

export const auth: Translation<typeof source> = {
  "auth.field.email.label": "Email",
  "auth.field.email.placeholder": "engineer@company.com",
  "auth.field.password.label": "Password",
  "auth.field.password.hint": {
    one: "At least {count} character",
    other: "At least {count} characters",
  },
  "auth.field.name.label": "Name",
  "auth.field.name.placeholder": "Optional",

  "auth.login.title": "Sign in to your workspace",
  "auth.login.subtitle": "Projects, sharing and edit history are tied to your account.",
  "auth.login.emailDivider": "or with email",
  "auth.login.submit": "Continue",
  "auth.login.submitting": "Signing in…",
  "auth.login.terms": "By continuing, you agree to the terms of use\nand the data processing policy.",
  "auth.login.noAccount": "No account yet?",
  "auth.login.registerLink": "Create one",
  "auth.login.failed": "Could not sign in.",

  "auth.register.title": "Create an account",
  "auth.register.subtitle": "A personal workspace for your CAD projects.",
  "auth.register.submit": "Create account",
  "auth.register.submitting": "Creating…",
  "auth.register.hasAccount": "Already have an account?",
  "auth.register.loginLink": "Sign in",
  "auth.register.failed": "Could not create the account.",
};
