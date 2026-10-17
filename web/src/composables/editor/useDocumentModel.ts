import { computed } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { featureSketchIds } from "@/lib/browserRebuildPlan";
import { workPlaneEntries, type WorkPlaneEntry } from "@/lib/workPlaneDocument";
import type { TimelineEntry } from "@/types/api";

export interface ComponentEntry {
  id: string;
  type?: string;
  plane?: string;
  entities?: unknown[];
  visible?: boolean;
  [key: string]: unknown;
}

export function useDocumentModel() {
  const documentStore = useDocument();

  const timelineEntries = computed<TimelineEntry[]>(() => {
    const tl = documentStore.document.value?.timeline;
    return (Array.isArray(tl) ? tl : []) as TimelineEntry[];
  });

  const sketches = computed<ComponentEntry[]>(() => {
    const comps = documentStore.document.value?.components ?? {};
    return Object.entries(comps)
      .filter(([, v]) => v && typeof v === "object" && "plane" in (v as Record<string, unknown>) && "entities" in (v as Record<string, unknown>))
      .map(([id, data]) => ({ id, ...(data as Record<string, unknown>) }));
  });

  const bodies = computed<ComponentEntry[]>(() => {
    const comps = documentStore.document.value?.components ?? {};
    return Object.entries(comps)
      .filter(([, v]) => v && typeof v === "object" && (v as Record<string, unknown>).type === "body")
      .map(([id, data]) => ({ id, ...(data as Record<string, unknown>) }));
  });

  const workPlanes = computed<WorkPlaneEntry[]>(() => workPlaneEntries(documentStore.document.value?.components ?? {}));

  function sketchHasFeature(sketchId: string): boolean {
    return timelineEntries.value.some((e) => featureSketchIds(e).includes(sketchId));
  }

  function dependentFeatures(sketchId: string): TimelineEntry[] {
    return timelineEntries.value.filter(
      (e) => (e.kind === "extrude" || e.kind === "revolve" || e.kind === "sweep" || e.kind === "hole") && featureSketchIds(e).includes(sketchId),
    );
  }

  return { timelineEntries, sketches, bodies, workPlanes, sketchHasFeature, dependentFeatures };
}
