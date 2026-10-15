import type { TimelineEntry } from "@/types/api";
import { HistoryEditError, removeEntries, type ModelDocument } from "./bodyHistory";
import { outputBodyOf, type RegenSeeds } from "./browserRebuildPlan";
import { fallbackBodyOf, isRolledBack, rollbackIndex } from "./timelineFlags";

export interface TimelineEditResult {
  document: ModelDocument;
  seeds: RegenSeeds;
  restoreSeeds: RegenSeeds;
}

const NO_SEEDS: RegenSeeds = { roots: [], bodies: [] };
const ENTRY_REFS = ["target_body_id", "tool_body_id"] as const;
const PARAM_REFS = ["target_body_id", "up_to_body_id"];
const SOURCE_REFS = ["target_body_id", "tool_body_id", "up_to_body_id", "body_id"];

type Rewire = { from: string; to: string };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function swapped(values: Record<string, unknown>, keys: readonly string[], rewire: Rewire): Record<string, unknown> {
  const changed = keys.filter((key) => values[key] === rewire.from);
  if (changed.length === 0) return values;
  return { ...values, ...Object.fromEntries(changed.map((key) => [key, rewire.to])) };
}

function rewiredEntry(entry: TimelineEntry, rewire: Rewire): TimelineEntry {
  const top = swapped(entry as unknown as Record<string, unknown>, ENTRY_REFS, rewire) as unknown as TimelineEntry;
  return entry.params ? { ...top, params: swapped(entry.params, PARAM_REFS, rewire) } : top;
}

function rewiredComponent(component: unknown, rewire: Rewire): unknown {
  const value = record(component);
  if (!value) return component;
  if (Array.isArray(value.entities)) return swapped(value, ["ref_body_id"], rewire);
  const source = record(value.source);
  return source ? { ...value, source: swapped(source, SOURCE_REFS, rewire) } : value;
}

function rewiredComponents(components: Record<string, unknown>, ids: Iterable<string>, rewire: Rewire) {
  const next = { ...components };
  for (const id of ids) if (id in next) next[id] = rewiredComponent(next[id], rewire);
  return next;
}

function entryOf(document: ModelDocument, entryId: string): TimelineEntry {
  const entry = document.timeline.find((candidate) => candidate.id === entryId);
  if (!entry) throw new HistoryEditError(`Записи «${entryId}» нет в истории.`);
  return entry;
}

function sketchUsers(document: ModelDocument, sketchId: string): TimelineEntry[] {
  return document.timeline.filter((entry) => entry.kind !== "sketch" && entry.sketch_id === sketchId);
}

export function sketchDependents(document: ModelDocument, entryId: string): TimelineEntry[] {
  const entry = entryOf(document, entryId);
  return entry.kind === "sketch" && entry.sketch_id ? sketchUsers(document, entry.sketch_id) : [];
}

function deleteSketchEntry(document: ModelDocument, entry: TimelineEntry): TimelineEditResult {
  const components = { ...document.components };
  if (entry.sketch_id) delete components[entry.sketch_id];
  const roots = entry.sketch_id ? sketchUsers(document, entry.sketch_id).map((user) => user.id) : [];
  const seeds = { roots, bodies: [] };
  return { document: { components, timeline: document.timeline.filter((item) => item !== entry) }, seeds, restoreSeeds: seeds };
}

function deleteFeatureEntry(document: ModelDocument, entry: TimelineEntry): TimelineEditResult {
  const output = outputBodyOf(entry);
  const fallback = fallbackBodyOf(entry);
  const index = document.timeline.indexOf(entry);
  let components = { ...document.components };
  if (output) delete components[output];
  let timeline = document.timeline.filter((item) => item !== entry);
  if (output && fallback) {
    const rewire = { from: output, to: fallback };
    timeline = timeline.map((item, position) => (position >= index ? rewiredEntry(item, rewire) : item));
    components = rewiredComponents(components, Object.keys(components), rewire);
  }
  const seedBody = fallback ?? output;
  const bodies = seedBody ? [seedBody] : [];
  return { document: { components, timeline }, seeds: { roots: [], bodies }, restoreSeeds: { roots: [entry.id], bodies } };
}

export function deleteTimelineEntry(document: ModelDocument, entryId: string): TimelineEditResult {
  const entry = entryOf(document, entryId);
  return entry.kind === "sketch" ? deleteSketchEntry(document, entry) : deleteFeatureEntry(document, entry);
}

export function setEntrySuppressed(document: ModelDocument, entryId: string, suppressed: boolean): TimelineEditResult {
  const entry = entryOf(document, entryId);
  if (entry.kind === "sketch") throw new HistoryEditError("Эскиз нельзя подавить: подавляют операции, построенные по нему.");
  const timeline = document.timeline.map((item) => {
    if (item !== entry) return item;
    const { suppressed: _previous, ...rest } = item;
    return suppressed ? { ...rest, suppressed: true } : rest;
  });
  const seeds = { roots: [entryId], bodies: [] };
  return { document: { components: document.components, timeline }, seeds, restoreSeeds: seeds };
}

function withRollback(entry: TimelineEntry, rolledBack: boolean): TimelineEntry {
  if (isRolledBack(entry) === rolledBack) return entry;
  const { rolled_back: _previous, ...rest } = entry;
  return rolledBack ? { ...rest, rolled_back: true } : rest;
}

export function rollTimelineTo(document: ModelDocument, index: number): TimelineEditResult {
  const marker = Math.max(0, Math.min(Math.trunc(index), document.timeline.length));
  const timeline = document.timeline.map((entry, position) => withRollback(entry, position >= marker));
  return { document: { components: document.components, timeline }, seeds: NO_SEEDS, restoreSeeds: NO_SEEDS };
}

export function deleteRolledBack(document: ModelDocument, describe: (entry: TimelineEntry) => string): TimelineEditResult {
  const rolledBack = document.timeline.filter(isRolledBack);
  if (rolledBack.length === 0) throw new HistoryEditError("После маркера отката нет операций.");
  return { document: removeEntries(document, rolledBack, describe), seeds: NO_SEEDS, restoreSeeds: NO_SEEDS };
}

function rewiredRollback(document: ModelDocument, rolledBack: TimelineEntry[], rewire: Rewire): ModelDocument {
  const ids = new Set(rolledBack.map((entry) => entry.id));
  const owned = rolledBack.flatMap((entry) => [entry.kind === "sketch" ? entry.sketch_id : outputBodyOf(entry)])
    .filter((id): id is string => Boolean(id));
  return {
    components: rewiredComponents(document.components, owned, rewire),
    timeline: document.timeline.map((entry) => (ids.has(entry.id) ? rewiredEntry(entry, rewire) : entry)),
  };
}

function referencesBody(document: ModelDocument, entry: TimelineEntry, bodyId: string): boolean {
  const sketch = record(entry.sketch_id ? document.components[entry.sketch_id] : null);
  const refs = [...ENTRY_REFS.map((key) => entry[key]), ...PARAM_REFS.map((key) => entry.params?.[key]), sketch?.ref_body_id];
  return refs.includes(bodyId);
}

export function placeAtRollbackMarker(knownEntryIds: string[], after: ModelDocument): TimelineEditResult | null {
  const known = new Set(knownEntryIds);
  const marker = rollbackIndex(after.timeline);
  const inserted = after.timeline.slice(marker).filter((entry) => !known.has(entry.id));
  if (inserted.length === 0) return null;
  const rolledBack = after.timeline.slice(marker).filter((entry) => known.has(entry.id));
  let document: ModelDocument = { components: after.components, timeline: [...after.timeline.slice(0, marker), ...inserted, ...rolledBack] };
  const roots = new Set<string>();
  const bodies = new Set<string>();
  for (const entry of inserted) {
    const output = outputBodyOf(entry);
    const fallback = fallbackBodyOf(entry);
    if (!output || !fallback) continue;
    rolledBack.filter((item) => item.kind !== "sketch" && referencesBody(document, item, fallback)).forEach((item) => roots.add(item.id));
    document = rewiredRollback(document, rolledBack, { from: fallback, to: output });
    bodies.add(fallback);
    bodies.add(output);
  }
  const outputs = [...bodies].filter((id) => inserted.some((entry) => outputBodyOf(entry) === id));
  return {
    document,
    seeds: { roots: [...roots], bodies: outputs },
    restoreSeeds: { roots: inserted.map((entry) => entry.id), bodies: [...bodies] },
  };
}
