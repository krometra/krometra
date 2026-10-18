export const SIGNED_IN_HINT_COOKIE = "kr_signed_in";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function signedInHintCookie(signedIn: boolean, secure: boolean): string {
  const lifetime = signedIn ? `max-age=${MAX_AGE_SECONDS}` : "max-age=0";
  const parts = [`${SIGNED_IN_HINT_COOKIE}=${signedIn ? "1" : ""}`, "path=/", lifetime, "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function hasSignedInHint(cookies: string): boolean {
  return cookies.split(";").some((part) => part.trim() === `${SIGNED_IN_HINT_COOKIE}=1`);
}

export function syncSignedInHint(signedIn: boolean): void {
  if (typeof document === "undefined") return;
  if (hasSignedInHint(document.cookie) === signedIn) return;
  document.cookie = signedInHintCookie(signedIn, window.location.protocol === "https:");
}
