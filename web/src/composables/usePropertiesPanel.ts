// Properties panel composable — derives which properties to show
// based on selection state, document timeline, and sketch mode.

import { computed } from "vue";
import { useSelection } from "@/composables/shared/useSelection";
import { useSketch } from "@/composables/shared/useSketch";
import { useDocument } from "@/composables/shared/useDocument";
import type { TimelineEntry } from "@/types/api";

export interface BodyProperties {
  bodyId: string;
  boundingBox?: { x: number; y: number; z: number };
  volume?: number;
}

export interface FaceProperties {
  bodyId: string;
  faceId: string | number;
  surfaceType?: string;
  area?: number;
}

export interface EdgeProperties {
  bodyId: string;
  edgeId: string | number;
  curveType?: string;
  length?: number;
}

export interface VertexProperties {
  bodyId: string;
  vertexId: number;
  position?: { x: number; y: number; z: number };
}

export interface FeatureProperties {
  entry: TimelineEntry;
  kind: "extrude" | "revolve" | "sweep" | "fillet" | "chamfer" | "boolean" | "sketch" | "thread" | "import" | "transform" | "shell" | "mirror";
  params: Record<string, unknown>;
}

export type PanelMode =
  | { type: "none" }
  | { type: "sketch" }
  | { type: "feature"; props: FeatureProperties }
  | { type: "body"; props: BodyProperties }
  | { type: "face"; props: FaceProperties }
  | { type: "edge"; props: EdgeProperties }
  | { type: "vertex"; props: VertexProperties };

export function usePropertiesPanel() {
  const selectionStore = useSelection();
  const sketchStore = useSketch();
  const documentStore = useDocument();

  // ── What is currently selected? ──

  const mode = computed<PanelMode>(() => {
    // Sketch mode takes priority
    if (sketchStore.sketchMode.value) {
      return { type: "sketch" };
    }

    // 3D selection (face/edge/vertex)
    const sel = selectionStore.selection.value;
    if (sel) {
      if (sel.type === "face") {
        return {
          type: "face",
          props: {
            bodyId: sel.bodyId,
            faceId: sel.faceId,
          },
        };
      }
      if (sel.type === "edge") {
        return {
          type: "edge",
          props: {
            bodyId: sel.bodyId,
            edgeId: sel.edgeId,
          },
        };
      }
      if (sel.type === "vertex") {
        return {
          type: "vertex",
          props: {
            bodyId: sel.bodyId,
            vertexId: sel.vertexId,
          },
        };
      }
    }

    const timeline = documentStore.document.value?.timeline;

    const selectedId = selectionStore.selectedFeatureId.value;
    if (selectedId && timeline) {
      const entry = timeline.find((e) => e.id === selectedId);
      if (entry) {
        return {
          type: "feature",
          props: featureFromEntry(entry),
        };
      }
    }

    if (timeline && timeline.length > 0) {
      const last = timeline[timeline.length - 1];
      return {
        type: "feature",
        props: featureFromEntry(last),
      };
    }

    return { type: "none" };
  });

  // ── Derived data ──

  const hasSelection = computed(() => mode.value.type !== "none");

  const title = computed(() => {
    switch (mode.value.type) {
      case "none":
        return "Нет выделения";
      case "sketch":
        return "Эскиз";
      case "feature":
        return mode.value.props.entry.label || "Фича";
      case "body":
        return `Тело: ${mode.value.props.bodyId}`;
      case "face":
        return `Грань #${mode.value.props.faceId}`;
      case "edge":
        return `Ребро #${mode.value.props.edgeId}`;
      case "vertex":
        return `Вершина #${mode.value.props.vertexId}`;
      default:
        return "";
    }
  });

  const kindLabel = computed(() => {
    switch (mode.value.type) {
      case "feature":
        return mode.value.props.kind.toUpperCase();
      case "face":
        return "FACE";
      case "edge":
        return "EDGE";
      case "vertex":
        return "VERTEX";
      case "sketch":
        return "SKETCH";
      default:
        return "";
    }
  });

  return {
    mode,
    hasSelection,
    title,
    kindLabel,
  };
}

// ── Helpers ──

function featureFromEntry(entry: TimelineEntry): FeatureProperties {
  return {
    entry,
    kind: entry.kind === "sketch" ? "sketch" : entry.kind,
    params: entry.params ?? {},
  };
}
