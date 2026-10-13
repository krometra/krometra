// Shared selection state (createSharedComposable — singleton)

import { ref, computed } from "vue";
import { createSharedComposable } from "@vueuse/core";
import type { BrepTopo } from "@/types/api";

export interface FaceSelection {
  type: "face";
  bodyId: string;
  faceId: string | number;
  brepTopo: BrepTopo;
}

export interface EdgeSelection {
  type: "edge";
  bodyId: string;
  edgeId: string | number;
  brepTopo: BrepTopo;
}

export interface VertexSelection {
  type: "vertex";
  bodyId: string;
  vertexId: number;
  brepTopo: BrepTopo;
}

export type SelectionState = FaceSelection | EdgeSelection | VertexSelection | null;

export const useSelection = createSharedComposable(() => {
  const selection = ref<SelectionState>(null);
  const selectedFeatureId = ref<string | null>(null);

  const hasSelection = computed(() => selection.value !== null);

  function selectFace(bodyId: string, faceId: string | number, brepTopo: BrepTopo) {
    selection.value = { type: "face", bodyId, faceId, brepTopo };
    selectedFeatureId.value = null;
  }

  function selectEdge(bodyId: string, edgeId: string | number, brepTopo: BrepTopo) {
    selection.value = { type: "edge", bodyId, edgeId, brepTopo };
    selectedFeatureId.value = null;
  }

  function selectVertex(bodyId: string, vertexId: number, brepTopo: BrepTopo) {
    selection.value = { type: "vertex", bodyId, vertexId, brepTopo };
    selectedFeatureId.value = null;
  }

  function selectFeature(entryId: string) {
    selectedFeatureId.value = entryId;
    selection.value = null;
  }

  function clearSelection() {
    selection.value = null;
    selectedFeatureId.value = null;
  }

  return {
    selection,
    selectedFeatureId,
    hasSelection,
    selectFace,
    selectEdge,
    selectVertex,
    selectFeature,
    clearSelection,
  };
});
