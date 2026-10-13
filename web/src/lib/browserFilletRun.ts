import type { TimelineEntry } from "@/types/api";
import { inputBodiesOf, isBrowserFeature, outputBodyOf } from "./browserRebuildPlan";

export interface FilletEdgeSource {
  bodyId: string;
  edgeNames: string[];
}

export interface FilletMergePlan {
  entryIds: string[];
  parentBodyId: string;
  sources: FilletEdgeSource[];
  featureKey: string;
}

const RADIUS_TOLERANCE = 1e-9;

function targetOf(entry: TimelineEntry): string | null {
  const target = entry.params?.target_body_id;
  return typeof target === "string" && target.length > 0 ? target : null;
}

function edgeNamesOf(entry: TimelineEntry): string[] {
  const names = entry.params?.edge_ids;
  return Array.isArray(names) ? names.map(String) : [];
}

function sameRadiusFillet(entry: TimelineEntry | undefined, radius: number): entry is TimelineEntry {
  return entry !== undefined
    && entry.kind === "fillet"
    && isBrowserFeature(entry)
    && Math.abs(Number(entry.params?.radius) - radius) <= RADIUS_TOLERANCE;
}

export function trailingBrowserFilletRun(timeline: TimelineEntry[], bodyId: string, radius: number): TimelineEntry[] {
  const run: TimelineEntry[] = [];
  let current: string | null = bodyId;
  while (current) {
    const body: string = current;
    const producer = timeline.find((entry) => outputBodyOf(entry) === body);
    if (!sameRadiusFillet(producer, radius)) break;
    const consumers = timeline.filter((entry) => inputBodiesOf(entry).includes(body));
    if (consumers.some((entry) => entry.id !== run[0]?.id)) break;
    run.unshift(producer);
    current = targetOf(producer);
  }
  return run;
}

export function filletMergePlan(timeline: TimelineEntry[], feature: { bodyId: string; edgeNames: string[]; radius: number }): FilletMergePlan | null {
  const run = trailingBrowserFilletRun(timeline, feature.bodyId, feature.radius);
  const parentBodyId = run.length > 0 ? targetOf(run[0]) : null;
  if (!parentBodyId) return null;
  const featureKey = run[0].params?.feature_key;
  return {
    entryIds: run.map((entry) => entry.id),
    parentBodyId,
    sources: [
      ...run.map((entry) => ({ bodyId: targetOf(entry) ?? parentBodyId, edgeNames: edgeNamesOf(entry) })),
      { bodyId: feature.bodyId, edgeNames: feature.edgeNames },
    ],
    featureKey: typeof featureKey === "string" && featureKey.length > 0 ? featureKey : run[0].id,
  };
}
