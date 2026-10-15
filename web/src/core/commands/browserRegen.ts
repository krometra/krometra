import type { BrowserRebuiltBody, BrowserSeatedSketch } from "@/composables/editor/useBrowserGeometry";
import { useApi } from "@/composables/useApi";
import type { ModelDocument } from "@/lib/bodyHistory";
import { browserRegenPlan, type RegenSeeds } from "@/lib/browserRebuildPlan";
import type { DocumentState } from "@/lib/documentRebase";
import { placeAtRollbackMarker } from "@/lib/timelineEdits";
import { syncLiveness } from "@/lib/timelineLiveness";
import { regeneratedDocument } from "@/lib/timelineRegen";
import type { Document } from "@/types/api";
import { rebuiltBodiesForm } from "./BrowserRebuildCommand";

export function browserRegenForm(
  document: ModelDocument,
  seeds: RegenSeeds,
  version: number,
  bodies: BrowserRebuiltBody[],
  sketchPlanes: BrowserSeatedSketch[],
): FormData {
  const form = rebuiltBodiesForm(version, bodies, sketchPlanes);
  form.set("document", JSON.stringify({ components: document.components, timeline: document.timeline }));
  form.set("seeds", JSON.stringify(seeds));
  return form;
}

export function modelDocumentOf(document: Document): ModelDocument {
  return { components: document.components ?? {}, timeline: document.timeline ?? [] };
}

async function saveDocument(projectId: string, current: Document, next: ModelDocument) {
  await useApi().put<Document>(`/projects/${projectId}/document`, { ...next, metadata: current.metadata, version: current.version });
}

export function existingSeeds(document: ModelDocument, seeds: RegenSeeds): RegenSeeds {
  const ids = new Set(document.timeline.map((entry) => entry.id));
  return { roots: seeds.roots.filter((id) => ids.has(id)), bodies: seeds.bodies };
}

export async function saveRegeneratedTimeline(projectId: string, current: Document, edited: ModelDocument, seeds: RegenSeeds): Promise<void> {
  const before = modelDocumentOf(current);
  const steps = browserRegenPlan(edited, seeds);
  if (steps.length === 0) {
    await saveDocument(projectId, current, syncLiveness(before, edited));
    return;
  }
  const { discardBrowserShape, rebuildBrowserHistory, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
  const { bodies, sketchPlanes, failures } = await rebuildBrowserHistory(steps);
  const next = regeneratedDocument(before, edited, steps, failures);
  try {
    await useApi().multipartPost(`/projects/${projectId}/geometry/browser-regen`, browserRegenForm(next, seeds, current.version, bodies, sketchPlanes));
    await Promise.all(bodies.map((body) => retainBrowserShape(body.shapeHandle, body.bodyId)));
  } catch (error) {
    await Promise.all(bodies.map((body) => discardBrowserShape(body.shapeHandle).catch(() => undefined)));
    throw error;
  }
}

export async function regenerateStoredTimeline(projectId: string, seeds: RegenSeeds): Promise<void> {
  if (seeds.roots.length === 0 && seeds.bodies.length === 0) return;
  const current = await useApi().get<Document>(`/projects/${projectId}/document`);
  const document = modelDocumentOf(current);
  await saveRegeneratedTimeline(projectId, current, document, existingSeeds(document, seeds));
}

export async function placeNewEntriesAtMarker(projectId: string, before: DocumentState, current: Document): Promise<RegenSeeds | null> {
  const placed = placeAtRollbackMarker(before.timeline.map((entry) => entry.id), modelDocumentOf(current));
  if (!placed) return null;
  await saveRegeneratedTimeline(projectId, current, placed.document, placed.seeds);
  return placed.restoreSeeds;
}
