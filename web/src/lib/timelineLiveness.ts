import type { TimelineEntry } from "@/types/api";
import type { ModelDocument } from "./bodyHistory";
import { consumedBodiesOf, isActiveEntry, outputFallbacks } from "./timelineFlags";

function isBody(component: unknown): boolean {
  return typeof component === "object" && component !== null && (component as { type?: unknown }).type === "body";
}

interface Producer {
  entry: TimelineEntry;
  fallback: string | null;
}

function producers(timeline: TimelineEntry[]): Map<string, Producer> {
  const byBody = new Map<string, Producer>();
  for (const entry of timeline) {
    for (const { output, fallback } of outputFallbacks(entry)) {
      if (!byBody.has(output)) byBody.set(output, { entry, fallback });
    }
  }
  return byBody;
}

function effectiveBody(bodyId: string, byBody: Map<string, Producer>): string | null {
  const seen = new Set<string>();
  let current: string | null = bodyId;
  while (current !== null && !seen.has(current)) {
    const producer = byBody.get(current);
    if (!producer || isActiveEntry(producer.entry)) return current;
    seen.add(current);
    current = producer.fallback;
  }
  return null;
}

export function liveBodyIds(document: ModelDocument): Set<string> {
  const byBody = producers(document.timeline);
  const consumed = new Set<string>();
  for (const entry of document.timeline) {
    if (!isActiveEntry(entry)) continue;
    for (const bodyId of consumedBodiesOf(entry)) {
      const effective = effectiveBody(bodyId, byBody);
      if (effective) consumed.add(effective);
    }
  }
  return new Set(Object.keys(document.components).filter((id) => {
    if (!isBody(document.components[id]) || consumed.has(id)) return false;
    const producer = byBody.get(id);
    return !producer || isActiveEntry(producer.entry);
  }));
}

export function syncLiveness(before: ModelDocument, after: ModelDocument): ModelDocument {
  const wasLive = liveBodyIds(before);
  const isLive = liveBodyIds(after);
  const components = { ...after.components };
  for (const [id, component] of Object.entries(components)) {
    if (!isBody(component) || !(id in before.components) || wasLive.has(id) === isLive.has(id)) continue;
    components[id] = { ...(component as Record<string, unknown>), visible: isLive.has(id) };
  }
  return { components, timeline: after.timeline };
}
