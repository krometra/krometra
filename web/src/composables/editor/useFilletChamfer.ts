import { ref, type Ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useSelection } from "@/composables/shared/useSelection";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { edgeGroupRows, type EdgeGroupRow } from "@/composables/viewport/edgeLabels";
import type { EdgeSelectionSnapshot } from "@/composables/viewport/useEdgeSelection";
import type { BrowserEdgeFeature } from "./useBrowserGeometry";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { SelectionMode, ViewportRef } from "./types";
import type { EditorTool } from "./useEditorTools";

export function useFilletChamfer(deps: {
  projectId: string;
  viewportRef: ViewportRef;
  viewportSelectionMode: Ref<SelectionMode>;
  meshes: BodyMeshesApi;
}) {
  const { projectId, viewportRef, viewportSelectionMode, meshes } = deps;
  const documentStore = useDocument();
  const selection = useSelection();
  const undoRedo = useUndoRedo();

  const filletChamferMode = ref(false);
  const mode = ref<"fillet" | "chamfer">("fillet");
  const bodyId = ref<string | null>(null);
  const edgeIds = ref<(string | number)[]>([]);
  const edgeRows = ref<EdgeGroupRow[]>([]);
  const chain = ref(true);
  const loading = ref(false);
  const error = ref<string | null>(null);

  interface PreviewParams {
    mode: "fillet" | "chamfer";
    radius: number;
    distance1: number;
    distance2: number;
  }
  const previewParams = ref<PreviewParams>({ mode: "fillet", radius: 5, distance1: 3, distance2: 3 });

  function previewRadius(): number {
    const p = previewParams.value;
    return p.mode === "fillet" ? p.radius : Math.max(p.distance1, p.distance2);
  }

  function refreshPreview() {
    const viewport = viewportRef.value;
    if (!viewport) return;
    if (!filletChamferMode.value || !bodyId.value || edgeIds.value.length === 0) {
      viewport.hideFilletPreview();
      return;
    }
    viewport.showFilletPreview(bodyId.value, edgeIds.value, previewRadius());
  }

  function updatePreview(params: PreviewParams) {
    previewParams.value = params;
    refreshPreview();
  }

  function setMode(next: "fillet" | "chamfer") {
    mode.value = next;
  }

  function enter(initialMode: "fillet" | "chamfer" = "fillet") {
    mode.value = initialMode;
    filletChamferMode.value = true;
    error.value = null;
    viewportSelectionMode.value = "edge";
    viewportRef.value?.clearEdgeSelection();
    viewportRef.value?.hideFilletPreview();
  }

  function exit() {
    filletChamferMode.value = false;
    error.value = null;
    viewportRef.value?.clearAllEdgeLines();
    viewportRef.value?.hideFilletPreview();
    viewportSelectionMode.value = "face";
  }

  function onEdgeSelectionChanged(snapshot: EdgeSelectionSnapshot) {
    const hadEdges = edgeIds.value.length > 0;
    bodyId.value = snapshot.bodyId;
    edgeIds.value = snapshot.edgeIds;
    edgeRows.value = edgeGroupRows(snapshot.brepTopo, snapshot.groups);
    chain.value = snapshot.chain;
    if (!filletChamferMode.value) return;

    const lastEdgeId = snapshot.edgeIds[snapshot.edgeIds.length - 1];
    if (snapshot.bodyId && snapshot.brepTopo && lastEdgeId !== undefined) {
      selection.selectEdge(snapshot.bodyId, lastEdgeId, snapshot.brepTopo);
    } else if (hadEdges) {
      selection.clearSelection();
    }
    refreshPreview();
  }

  function setChain(enabled: boolean) {
    viewportRef.value?.setEdgeChain(enabled);
  }

  function removeRow(row: EdgeGroupRow) {
    if (bodyId.value) viewportRef.value?.toggleEdge(bodyId.value, row.edgeIds[0]);
  }

  function highlightRow(row: EdgeGroupRow) {
    if (bodyId.value) viewportRef.value?.highlightEdges(bodyId.value, row.edgeIds);
  }

  function clearRowHighlight() {
    viewportRef.value?.clearEdgeHighlight();
  }

  function clear() {
    viewportRef.value?.clearEdgeSelection();
    error.value = null;
    selection.clearSelection();
  }

  async function runEdgeFeature(feature: BrowserEdgeFeature, fallbackError: string) {
    loading.value = true;
    error.value = null;
    try {
      const { BrowserEdgeFeatureCommand } = await import("@/core/commands/BrowserEdgeFeatureCommand");
      const command = new BrowserEdgeFeatureCommand(
        projectId,
        feature,
        () => documentStore.document.value,
        (bodyId) => meshes.untrackMesh(bodyId),
      );
      await undoRedo.execute(command);
      const result = command.getResult();
      if (result) meshes.trackMesh(result.bodyId, result.mesh);
      documentStore.markDirty();
      await documentStore.load(projectId);
      exit();
    } catch (err: unknown) {
      const apiError = err as { error_description?: string };
      error.value = apiError?.error_description ?? (err instanceof Error ? err.message : fallbackError);
      console.error(`${fallbackError}:`, err);
    } finally {
      loading.value = false;
    }
  }

  function edgeNames(ids: (string | number)[]): string[] {
    return ids.map(String);
  }

  async function applyFillet(params: { edgeIds: (string | number)[]; radius: number }) {
    if (!bodyId.value) return;
    await runEdgeFeature({ kind: "fillet", bodyId: bodyId.value, edgeNames: edgeNames(params.edgeIds), radius: params.radius }, "Ошибка скругления");
  }

  async function applyChamfer(params: { edgeIds: (string | number)[]; distance1: number; distance2: number }) {
    if (!bodyId.value) return;
    await runEdgeFeature({
      kind: "chamfer",
      bodyId: bodyId.value,
      edgeNames: edgeNames(params.edgeIds),
      distance1: params.distance1,
      distance2: params.distance2,
    }, "Ошибка фаски");
  }

  const tool: EditorTool = {
    actions: ["fillet", "chamfer"],
    active: filletChamferMode,
    loading,
    busyLabel: "Построение…",
    enter: (action) => enter(action === "chamfer" ? "chamfer" : "fillet"),
    exit,
  };

  return {
    tool,
    filletChamferMode,
    mode,
    setMode,
    bodyId,
    edgeIds,
    edgeRows,
    chain,
    loading,
    error,
    enter,
    exit,
    onEdgeSelectionChanged,
    setChain,
    removeRow,
    highlightRow,
    clearRowHighlight,
    clear,
    updatePreview,
    applyFillet,
    applyChamfer,
  };
}

export type FilletChamferApi = ReturnType<typeof useFilletChamfer>;
