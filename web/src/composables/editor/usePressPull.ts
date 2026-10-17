import { computed, ref, watch, type Ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useParameters } from "@/composables/useParameters";
import { useSelection } from "@/composables/shared/useSelection";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { apiErrorMessage } from "@/composables/useToast";
import { shellFaceRows, toggleShellFace, type ShellFaceSelection } from "@/lib/browserShell";
import { PRESS_PULL_MIN_DISTANCE } from "@/lib/browserPressPull";
import { pressPullGhost } from "@/lib/pressPullPreview";
import { parameterQuantities } from "@/lib/units";
import type { BrepTopo } from "@/types/api";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { SelectionMode, ViewportRef } from "./types";
import type { EditorTool } from "./useEditorTools";
import { useQuantityField } from "./useQuantityField";

const EMPTY: ShellFaceSelection = { bodyId: null, faceIds: [] };

export function usePressPull(deps: {
  projectId: string;
  viewportRef: ViewportRef;
  viewportSelectionMode: Ref<SelectionMode>;
  meshes: BodyMeshesApi;
}) {
  const { projectId, viewportRef, viewportSelectionMode, meshes } = deps;
  const documentStore = useDocument();
  const parameters = useParameters();
  const selection = useSelection();
  const undoRedo = useUndoRedo();

  const pressPullMode = ref(false);
  const bodyId = ref<string | null>(null);
  const faceIds = ref<(string | number)[]>([]);
  const newBody = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const distanceField = useQuantityField({
    dimension: "length",
    initial: 1,
    variables: () => parameterQuantities(parameters.parameters.value),
    rangeError: (value) => (Math.abs(value) >= PRESS_PULL_MIN_DISTANCE ? null : "Смещение не может быть нулевым: плюс наружу, минус внутрь."),
  });

  const bodyMesh = computed(() => meshes.meshBodies.value.find((body) => body.body_id === bodyId.value)?.mesh ?? null);
  const faceRows = computed(() => shellFaceRows(bodyMesh.value, faceIds.value));
  const canApply = computed(() => faceIds.value.length > 0 && !distanceField.invalid.value && !loading.value);

  function refreshPreview() {
    const viewport = viewportRef.value;
    if (!viewport) return;
    const mesh = bodyMesh.value;
    if (!pressPullMode.value || !mesh || faceIds.value.length === 0 || distanceField.invalid.value) {
      viewport.hidePressPullPreview();
      return;
    }
    const distance = distanceField.value.value;
    viewport.showPressPullPreview(pressPullGhost(mesh, faceIds.value, distance), distance > 0);
  }

  watch([pressPullMode, bodyMesh, faceIds, distanceField.value, distanceField.invalid], refreshPreview);

  function setFaces(next: ShellFaceSelection) {
    bodyId.value = next.bodyId;
    faceIds.value = next.faceIds;
    const viewport = viewportRef.value;
    if (next.bodyId) viewport?.markFaces(next.bodyId, next.faceIds);
    else viewport?.clearMarkedFaces();
  }

  function enter() {
    pressPullMode.value = true;
    error.value = null;
    setFaces(EMPTY);
    viewportSelectionMode.value = "face";
    viewportRef.value?.clearHighlight();
  }

  function exit() {
    pressPullMode.value = false;
    error.value = null;
    setFaces(EMPTY);
    viewportRef.value?.clearHighlight();
    viewportRef.value?.hidePressPullPreview();
    viewportSelectionMode.value = "face";
  }

  function clear() {
    error.value = null;
    setFaces(EMPTY);
    viewportRef.value?.clearHighlight();
    selection.clearSelection();
  }

  function toggleFace(body: string, faceId: string | number) {
    error.value = null;
    setFaces(toggleShellFace({ bodyId: bodyId.value, faceIds: faceIds.value }, body, faceId));
  }

  function onFaceSelected(payload: { bodyId: string; faceId: string | number; brepTopo: BrepTopo }): boolean {
    if (!pressPullMode.value) return false;
    toggleFace(payload.bodyId, payload.faceId);
    viewportRef.value?.clearHighlight();
    return true;
  }

  function removeFace(faceId: string | number) {
    if (bodyId.value) toggleFace(bodyId.value, faceId);
  }

  function selectFaces(body: string, faces: (string | number)[]) {
    error.value = null;
    setFaces({ bodyId: faces.length > 0 ? body : null, faceIds: [...faces] });
  }

  function setNewBody(value: boolean) {
    newBody.value = value;
  }

  async function apply() {
    if (!bodyId.value || !canApply.value) return;
    const feature = { bodyId: bodyId.value, faceNames: faceIds.value.map(String), distance: distanceField.value.value, newBody: newBody.value };
    loading.value = true;
    error.value = null;
    try {
      const { BrowserPressPullCommand } = await import("@/core/commands/BrowserPressPullCommand");
      const command = new BrowserPressPullCommand(projectId, feature, () => documentStore.document.value);
      await undoRedo.execute(command);
      const result = command.getResult();
      if (!result) throw new Error("Сдвиг грани не сохранён.");
      result.hiddenBodyIds.forEach((hidden) => meshes.untrackMesh(hidden));
      meshes.trackMesh(result.bodyId, result.mesh);
      documentStore.markDirty();
      await documentStore.load(projectId);
      exit();
    } catch (err) {
      error.value = apiErrorMessage(err, "Не удалось сдвинуть грань");
    } finally {
      loading.value = false;
    }
  }

  const tool: EditorTool = { actions: ["press_pull"], active: pressPullMode, loading, busyLabel: "Сдвиг грани…", enter, exit, onFaceSelected };

  return {
    tool,
    pressPullMode,
    bodyId,
    faceIds,
    faceRows,
    distanceField,
    newBody,
    loading,
    error,
    canApply,
    enter,
    exit,
    clear,
    onFaceSelected,
    removeFace,
    selectFaces,
    setNewBody,
    apply,
  };
}

export type PressPullApi = ReturnType<typeof usePressPull>;
