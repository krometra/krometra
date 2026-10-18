export const RESEND_COOLDOWN_MS = 60_000;

export function cooldownEnd(now: number, durationMs = RESEND_COOLDOWN_MS): number {
  return now + durationMs;
}

export function secondsLeft(end: number | null, now: number): number {
  if (end === null) return 0;
  return Math.max(0, Math.ceil((end - now) / 1000));
}
