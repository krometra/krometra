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

  "auth.field.newPassword.label": "New password",
  "auth.field.confirmPassword.label": "Repeat the password",
  "auth.login.forgotLink": "Forgot your password?",
  "auth.login.passwordReset": "Password changed. Sign in with the new password.",
  "auth.register.verifySent":
    "We sent an email to {email}: open the link in it to confirm the address. You can start working right away.",

  "auth.forgot.title": "Password recovery",
  "auth.forgot.subtitle": "Enter your account email and we will send a link to set a new password.",
  "auth.forgot.submit": "Send link",
  "auth.forgot.submitting": "Sending…",
  "auth.forgot.sent": "If this address exists, we sent an email to {email}. The link is valid for 1 hour.",
  "auth.forgot.failed": "Could not send the email.",
  "auth.forgot.backToLogin": "Back to sign in",

  "auth.reset.title": "New password",
  "auth.reset.subtitle": "Choose a new password. Once it is saved, sessions on all devices will end.",
  "auth.reset.submit": "Save password",
  "auth.reset.submitting": "Saving…",
  "auth.reset.failed": "Could not change the password.",
  "auth.reset.invalidLink": "The link is invalid or expired: it works for 1 hour and only once.",
  "auth.reset.requestNew": "Request a new link",

  "auth.verify.title": "Email confirmation",
  "auth.verify.subtitle": "The link from the email confirms your account address.",
  "auth.verify.pending": "Checking the link…",
  "auth.verify.success": "Email confirmed. Thank you!",
  "auth.verify.alreadyVerified": "Your email is already confirmed.",
  "auth.verify.invalidLink": "The link is invalid or expired. Send the email again.",
  "auth.verify.failed": "Could not confirm the email.",
  "auth.verify.loginToResend": "Sign in to send the email again.",
  "auth.verify.toProjects": "Go to projects",
  "auth.verify.toLogin": "Sign in",
};
