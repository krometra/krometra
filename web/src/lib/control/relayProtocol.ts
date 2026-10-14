import type { ControlRequest } from "./protocol";

export type RelayIncoming =
  | { type: "welcome" }
  | { type: "rejected"; reason: string }
  | { type: "session"; attached: boolean }
  | { type: "request"; id: string; request: ControlRequest };

const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

export function relayUrl(location: { protocol: string; host: string }): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/mcp/ws`;
}

export function reconnectDelay(attempt: number): number {
  return BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRelayMessage(raw: string): RelayIncoming | null {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(message)) return null;
  if (message.type === "welcome") return { type: "welcome" };
  if (message.type === "rejected") return { type: "rejected", reason: String(message.reason ?? "") };
  if (message.type === "session" && typeof message.attached === "boolean") return { type: "session", attached: message.attached };
  if (message.type === "request" && typeof message.id === "string" && isObject(message.request) && typeof message.request.op === "string") {
    return { type: "request", id: message.id, request: message.request as unknown as ControlRequest };
  }
  return null;
}
