import type { TimelineEntry } from "@/types/api";
import { sameJson } from "./documentRebase";

export interface TimelineChange {
  added: TimelineEntry[];
  removed: TimelineEntry[];
  changed: TimelineEntry[];
}

export function timelineChange(before: TimelineEntry[], after: TimelineEntry[]): TimelineChange {
  const beforeById = new Map(before.map((entry) => [entry.id, entry]));
  const afterIds = new Set(after.map((entry) => entry.id));
  return {
    added: after.filter((entry) => !beforeById.has(entry.id)),
    removed: before.filter((entry) => !afterIds.has(entry.id)),
    changed: after.filter((entry) => beforeById.has(entry.id) && !sameJson(beforeById.get(entry.id), entry)),
  };
}

export function changedComponentIds(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...ids].filter((id) => !sameJson(before[id], after[id]));
}

export function isEmptyChange(change: TimelineChange): boolean {
  return change.added.length + change.removed.length + change.changed.length === 0;
}
