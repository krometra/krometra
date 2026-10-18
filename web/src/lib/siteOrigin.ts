export const PUBLIC_SITE_URL = "https://krometra.ru";

export function siteOrigin(): string {
  return typeof window === "undefined" ? PUBLIC_SITE_URL : window.location.origin;
}
