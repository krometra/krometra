import type { TimelineEntry } from "@/types/api";
import { featureSketchIds, inputBodiesOf, outputBodyOf } from "./browserRebuildPlan";

export interface ModelDocument {
  components: Record<string, unknown>;
  timeline: TimelineEntry[];
}

export class HistoryEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoryEditError";
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function consumedBodiesOf(entry: TimelineEntry): string[] {
  if (entry.kind === "boolean") return [entry.target_body_id, entry.tool_body_id].map(text).filter((id): id is string => id !== null);
  const params = entry.params ?? {};
  if (entry.kind === "transform" && params.copy === true) return [];
  const target = text(params.target_body_id);
  return target ? [target] : [];
}

export function bodyConsumers(document: ModelDocument): Map<string, TimelineEntry> {
  const consumers = new Map<string, TimelineEntry>();
  for (const entry of document.timeline) {
    for (const bodyId of consumedBodiesOf(entry)) if (!consumers.has(bodyId)) consumers.set(bodyId, entry);
  }
  return consumers;
}

function producerOf(document: ModelDocument, bodyId: string): TimelineEntry | null {
  return document.timeline.find((entry) => outputBodyOf(entry) === bodyId) ?? null;
}

function sketchBody(document: ModelDocument, sketchId: string | null | undefined): string | null {
  return sketchId ? text(record(document.components[sketchId])?.ref_body_id) : null;
}

function sketchEntryOf(document: ModelDocument, sketchId: string): TimelineEntry | null {
  return document.timeline.find((entry) => entry.kind === "sketch" && entry.sketch_id === sketchId) ?? null;
}

function usesBodies(document: ModelDocument, entry: TimelineEntry, bodies: Set<string>): boolean {
  if (inputBodiesOf(entry).some((id) => bodies.has(id))) return true;
  const owner = entry.kind === "sketch" ? sketchBody(document, entry.sketch_id) : null;
  return owner !== null && bodies.has(owner);
}

function usesSketches(entry: TimelineEntry, sketches: Set<string>): boolean {
  return featureSketchIds(entry).some((sketchId) => sketches.has(sketchId));
}

function removedOutputs(document: ModelDocument, entries: TimelineEntry[]) {
  const bodies = new Set(entries.map(outputBodyOf).filter((id): id is string => id !== null));
  const sketches = new Set(entries.filter((entry) => entry.kind === "sketch" && entry.sketch_id).map((entry) => entry.sketch_id as string));
  return { bodies, sketches, all: new Set([...bodies, ...sketches].filter((id) => id in document.components)) };
}

export function blockingEntries(document: ModelDocument, removed: TimelineEntry[]): TimelineEntry[] {
  const removedIds = new Set(removed.map((entry) => entry.id));
  const { bodies, sketches } = removedOutputs(document, removed);
  return document.timeline.filter(
    (entry) => !removedIds.has(entry.id) && (usesBodies(document, entry, bodies) || usesSketches(entry, sketches)),
  );
}

export function removeEntries(document: ModelDocument, removed: TimelineEntry[], describe: (entry: TimelineEntry) => string): ModelDocument {
  const blockers = blockingEntries(document, removed);
  if (blockers.length > 0) {
    throw new HistoryEditError(`От удаляемого зависят операции: ${blockers.map(describe).join(", ")}. Сначала удалите их.`);
  }
  const removedIds = new Set(removed.map((entry) => entry.id));
  const { all } = removedOutputs(document, removed);
  const components = Object.fromEntries(Object.entries(document.components).filter(([id]) => !all.has(id)));
  for (const bodyId of removed.flatMap(consumedBodiesOf)) {
    const body = record(components[bodyId]);
    if (body) components[bodyId] = { ...body, visible: true };
  }
  return { components, timeline: document.timeline.filter((entry) => !removedIds.has(entry.id)) };
}

export function bodyChain(document: ModelDocument, bodyId: string): TimelineEntry[] {
  const chain = new Map<string, TimelineEntry>();
  const pending = [bodyId];
  while (pending.length > 0) {
    const producer = producerOf(document, pending.pop() as string);
    if (!producer || chain.has(producer.id)) continue;
    chain.set(producer.id, producer);
    pending.push(...consumedBodiesOf(producer));
  }
  const sketches = new Set([...chain.values()].flatMap(featureSketchIds));
  for (const sketchId of sketches) {
    const entry = sketchEntryOf(document, sketchId);
    const sharedWithOthers = document.timeline.some((other) => !chain.has(other.id) && usesSketches(other, new Set([sketchId])));
    if (entry && !sharedWithOthers) chain.set(entry.id, entry);
  }
  const bodies = removedOutputs(document, [...chain.values()]).bodies;
  for (const entry of document.timeline) {
    if (entry.kind === "sketch" && !chain.has(entry.id) && usesBodies(document, entry, bodies)) {
      const used = document.timeline.some((other) => !chain.has(other.id) && usesSketches(other, new Set([entry.sketch_id ?? ""])));
      if (!used) chain.set(entry.id, entry);
    }
  }
  return document.timeline.filter((entry) => chain.has(entry.id));
}

export function deleteBody(document: ModelDocument, bodyId: string, describe: (entry: TimelineEntry) => string): ModelDocument {
  const consumer = bodyConsumers(document).get(bodyId);
  if (consumer) {
    throw new HistoryEditError(`Тело уже поглощено операцией ${describe(consumer)}: удалите тело-результат этой операции.`);
  }
  const chain = bodyChain(document, bodyId);
  if (chain.length === 0) {
    const components = { ...document.components };
    delete components[bodyId];
    return { components, timeline: document.timeline };
  }
  return removeEntries(document, chain, describe);
}

export function deleteEntry(document: ModelDocument, entryId: string, describe: (entry: TimelineEntry) => string): ModelDocument {
  const entry = document.timeline.find((candidate) => candidate.id === entryId);
  if (!entry) throw new HistoryEditError(`Записи «${entryId}» нет в истории.`);
  return removeEntries(document, [entry], describe);
}

export function deleteSketch(document: ModelDocument, sketchId: string, describe: (entry: TimelineEntry) => string): ModelDocument {
  const entry = sketchEntryOf(document, sketchId);
  if (entry) return removeEntries(document, [entry], describe);
  const components = { ...document.components };
  delete components[sketchId];
  return { components, timeline: document.timeline };
}
