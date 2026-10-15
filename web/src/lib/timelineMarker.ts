import type { TimelineEntry } from "@/types/api";
import { entryError, isRolledBack, isSuppressed } from "./timelineFlags";

export type TimelineSlot = { kind: "entry"; entry: TimelineEntry; index: number } | { kind: "marker" };

export function markerIndexAt(nodeCenters: number[], x: number): number {
  return nodeCenters.filter((center) => center < x).length;
}

export function steppedMarker(marker: number, step: number, count: number): number {
  return Math.max(0, Math.min(count, marker + step));
}

export function timelineSlots(entries: TimelineEntry[], marker: number): TimelineSlot[] {
  const slots: TimelineSlot[] = entries.map((entry, index) => ({ kind: "entry", entry, index }));
  slots.splice(Math.max(0, Math.min(marker, entries.length)), 0, { kind: "marker" });
  return slots;
}

export function entryStateHint(entry: TimelineEntry): string | null {
  const error = entryError(entry);
  if (error) return `Ошибка: ${error}`;
  if (isSuppressed(entry)) return "Подавлена: модель построена без этой операции.";
  if (isRolledBack(entry)) return "После маркера отката: не входит в модель.";
  return null;
}
