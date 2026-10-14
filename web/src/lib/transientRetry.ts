import { ApiError } from "./apiError";

export const TRANSIENT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

const TRANSIENT_STATUSES = new Set([0, 502, 503, 504]);

export function isTransientFailure(error: unknown): boolean {
  return error instanceof ApiError && TRANSIENT_STATUSES.has(error.status);
}

export async function retryTransient<T>(
  run: () => Promise<T>,
  delays: readonly number[] = TRANSIENT_RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (const delay of delays) {
    try {
      return await run();
    } catch (error) {
      if (!isTransientFailure(error)) throw error;
      await sleep(delay);
    }
  }
  return run();
}
