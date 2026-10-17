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

function texts(values: unknown[]): string[] {
  return values.map(text).filter((id): id is string => id !== null);
}

export function outputBodyOf(entry: TimelineEntry): string | null {
  return text(entry.kind === "boolean" ? entry.result_body_id : entry.body_id);
}

export function outputBodiesOf(entry: TimelineEntry): string[] {
  if (Array.isArray(entry.body_ids)) return texts(entry.body_ids);
  const output = outputBodyOf(entry);
  return output ? [output] : [];
}

export function booleanToolsOf(entry: TimelineEntry): string[] {
  return Array.isArray(entry.tool_body_ids) ? texts(entry.tool_body_ids) : texts([entry.tool_body_id]);
}

export function keepsTools(entry: TimelineEntry): boolean {
  return entry.params?.keep_tools === true;
}

export function cutTargetsOf(entry: TimelineEntry): string[] {
  const targets = entry.kind === "extrude" ? entry.params?.target_body_ids : null;
  return Array.isArray(targets) ? texts(targets) : [];
}

export function consumedBodiesOf(entry: TimelineEntry): string[] {
  if (entry.kind === "boolean") return texts([entry.target_body_id, ...(keepsTools(entry) ? [] : booleanToolsOf(entry))]);
  const cutTargets = cutTargetsOf(entry);
  if (cutTargets.length > 0) return cutTargets;
  const params = entry.params ?? {};
  if (entry.kind === "transform" && params.copy === true) return [];
  if (entry.kind === "mirror" && params.merge !== true) return [];
  if (entry.kind === "pattern" && params.mode === "separate") return [];
  if (entry.kind === "press_pull" && params.new_body === true) return [];
  const target = text(params.target_body_id);
  return target ? [target] : [];
}

export function fallbackBodyOf(entry: TimelineEntry): string | null {
  return consumedBodiesOf(entry)[0] ?? null;
}

export interface OutputFallback {
  output: string;
  fallback: string | null;
}

export function outputFallbacks(entry: TimelineEntry): OutputFallback[] {
  const outputs = outputBodiesOf(entry);
  const cutTargets = cutTargetsOf(entry);
  if (cutTargets.length > 0) return outputs.map((output, index) => ({ output, fallback: cutTargets[index] ?? null }));
  return outputs.map((output, index) => ({ output, fallback: index === 0 ? fallbackBodyOf(entry) : null }));
}

export function rollbackIndex(timeline: TimelineEntry[]): number {
  const index = timeline.findIndex(isRolledBack);
  return index < 0 ? timeline.length : index;
}
