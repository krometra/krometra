import { computed, ref, type Ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useSelection } from "@/composables/shared/useSelection";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { shellFaceRows, toggleShellFace, type ShellDirection, type ShellFaceSelection } from "@/lib/browserShell";
import type { BrepTopo } from "@/types/api";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { SelectionMode, ViewportRef } from "./types";
import type { EditorTool } from "./useEditorTools";

const EMPTY: ShellFaceSelection = { bodyId: null, faceIds: [] };

export function useShell(deps: {
  projectId: string;
  viewportRef: ViewportRef;
  viewportSelectionMode: Ref<SelectionMode>;
  meshes: BodyMeshesApi;
}) {
  const { projectId, viewportRef, viewportSelectionMode, meshes } = deps;
  const documentStore = useDocument();
  const selection = useSelection();
  const undoRedo = useUndoRedo();

  const shellMode = ref(false);
  const bodyId = ref<string | null>(null);
  const faceIds = ref<(string | number)[]>([]);
  const thickness = ref(2);
  const direction = ref<ShellDirection>("inward");
  const loading = ref(false);
  const error = ref<string | null>(null);

  const faceRows = computed(() => {
    const mesh = meshes.meshBodies.value.find((body) => body.body_id === bodyId.value)?.mesh ?? null;
    return shellFaceRows(mesh, faceIds.value);
  });

  function setFaces(next: ShellFaceSelection) {
    bodyId.value = next.bodyId;
    faceIds.value = next.faceIds;
    const viewport = viewportRef.value;
    if (next.bodyId) viewport?.markFaces(next.bodyId, next.faceIds);
    else viewport?.clearMarkedFaces();
  }

  function enter() {
    shellMode.value = true;
    error.value = null;
    setFaces(EMPTY);
    viewportSelectionMode.value = "face";
    viewportRef.value?.clearHighlight();
  }

  function exit() {
    shellMode.value = false;
    error.value = null;
    setFaces(EMPTY);
    viewportRef.value?.clearHighlight();
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
    if (!shellMode.value) return false;
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

  function setThickness(value: number) {
    thickness.value = value;
  }

  function setDirection(value: ShellDirection) {
    direction.value = value;
  }

  async function apply() {
    if (!bodyId.value || faceIds.value.length === 0) return;
    const feature = { bodyId: bodyId.value, faceNames: faceIds.value.map(String), thickness: thickness.value, direction: direction.value };
    loading.value = true;
    error.value = null;
    try {
      const { BrowserShellCommand } = await import("@/core/commands/BrowserShellCommand");
      const command = new BrowserShellCommand(projectId, feature, () => documentStore.document.value);
      await undoRedo.execute(command);
      const result = command.getResult();
      if (!result) throw new Error("Оболочка не сохранена.");
      result.hiddenBodyIds.forEach((hidden) => meshes.untrackMesh(hidden));
      meshes.trackMesh(result.bodyId, result.mesh);
      documentStore.markDirty();
      await documentStore.load(projectId);
      exit();
    } catch (err: unknown) {
      const apiError = err as { error_description?: string };
      error.value = apiError?.error_description ?? (err instanceof Error ? err.message : "Ошибка построения оболочки");
      console.error("Ошибка оболочки:", err);
    } finally {
      loading.value = false;
    }
  }

  const tool: EditorTool = { actions: ["shell"], active: shellMode, loading, busyLabel: "Построение оболочки…", enter, exit, onFaceSelected };

  return {
    tool,
    shellMode,
    bodyId,
    faceIds,
    faceRows,
    thickness,
    direction,
    loading,
    error,
    enter,
    exit,
    clear,
    onFaceSelected,
    removeFace,
    selectFaces,
    setThickness,
    setDirection,
    apply,
  };
}

export type ShellApi = ReturnType<typeof useShell>;
