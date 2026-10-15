import type { TimelineEntry } from "@/types/api";

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function isSuppressed(entry: TimelineEntry): boolean {
  return entry.suppressed === true;
}

export function isRolledBack(entry: TimelineEntry): boolean {
  return entry.rolled_back === true;
}

export function isFailed(entry: TimelineEntry): boolean {
  return entry.status === "error";
}

export function isActiveEntry(entry: TimelineEntry): boolean {
  return !isSuppressed(entry) && !isRolledBack(entry) && !isFailed(entry);
}

export function entryError(entry: TimelineEntry): string | null {
  return isFailed(entry) ? text(entry.error_message) ?? "Операция не построилась." : null;
}

export function consumedBodiesOf(entry: TimelineEntry): string[] {
  if (entry.kind === "boolean") return [entry.target_body_id, entry.tool_body_id].map(text).filter((id): id is string => id !== null);
  const params = entry.params ?? {};
  if (entry.kind === "transform" && params.copy === true) return [];
  const target = text(params.target_body_id);
  return target ? [target] : [];
}

export function fallbackBodyOf(entry: TimelineEntry): string | null {
  return consumedBodiesOf(entry)[0] ?? null;
}

export function rollbackIndex(timeline: TimelineEntry[]): number {
  const index = timeline.findIndex(isRolledBack);
  return index < 0 ? timeline.length : index;
}
