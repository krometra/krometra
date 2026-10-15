import { computed, ref, type Ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { useDisplayNames } from "@/composables/useDisplayNames";
import type { BooleanOperation } from "@/types/api";
import { isBrowserBody } from "./browserShapeHydration";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { SelectionMode, ViewportRef } from "./types";
import type { EditorTool } from "./useEditorTools";

export function useBooleanMode(deps: {
  projectId: string;
  viewportRef: ViewportRef;
  viewportSelectionMode: Ref<SelectionMode>;
  meshes: BodyMeshesApi;
}) {
  const { projectId, viewportRef, viewportSelectionMode, meshes } = deps;
  const documentStore = useDocument();
  const names = useDisplayNames();
  const undoRedo = useUndoRedo();

  const booleanMode = ref(false);
  const targetId = ref<string | null>(null);
  const toolId = ref<string | null>(null);
  const operation = ref<BooleanOperation>("union");
  const loading = ref(false);
  const error = ref<string | null>(null);

  const availableBodies = computed(() =>
    meshes.meshBodies.value.map((b) => ({
      id: b.body_id,
      label: names.bodyLabel(b.body_id),
    })),
  );

  function enter() {
    booleanMode.value = true;
    viewportSelectionMode.value = "body";
  }

  function exit() {
    booleanMode.value = false;
    viewportSelectionMode.value = "face";
    targetId.value = null;
    toolId.value = null;
    error.value = null;
    viewportRef.value?.clearBodySelection();
  }

  function setOperation(next: BooleanOperation) {
    operation.value = next;
  }

  function selectTarget(id: string) {
    targetId.value = id;
    viewportRef.value?.selectBodyAsTarget(id);
  }

  function selectTool(id: string) {
    toolId.value = id;
    viewportRef.value?.selectBodyAsTool(id);
  }

  function syncFromViewport() {
    const { targetId: t, toolId: tool } = viewportRef.value?.getSelectedBodyIds() ?? {};
    return { t, tool };
  }

  function handleBodySelected() {
    const { t, tool } = syncFromViewport();
    if (t && t !== targetId.value) {
      targetId.value = t;
      toolId.value = tool ?? null;
    } else if (!t && !tool) {
      targetId.value = null;
      toolId.value = null;
    }
  }

  function handleBodyDeselected() {
    const { t, tool } = syncFromViewport();
    targetId.value = t ?? null;
    toolId.value = tool ?? null;
  }

  function isBrowserBodyId(bodyId: string) {
    const component = documentStore.document.value?.components?.[bodyId];
    return isBrowserBody({ id: bodyId, ...(component as object | undefined) });
  }

  async function executeBoolean(targetBodyId: string, toolBodyId: string) {
    if (![targetBodyId, toolBodyId].every(isBrowserBodyId)) {
      error.value = "Булева операция доступна только для тел браузерного ядра.";
      return null;
    }
    loading.value = true;
    error.value = null;
    try {
      const { BrowserBooleanCommand } = await import("@/core/commands/BrowserBooleanCommand");
      const command = new BrowserBooleanCommand(
        projectId,
        operation.value,
        targetBodyId,
        toolBodyId,
        () => documentStore.document.value,
      );
      await undoRedo.execute(command);
      const result = command.getResult();
      return result ? { result_body_id: result.bodyId, mesh: result.mesh } : null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Не удалось выполнить булеву операцию в браузере.";
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function apply() {
    if (!targetId.value || !toolId.value) return;
    const result = await executeBoolean(targetId.value, toolId.value);
    if (result) {
      meshes.trackMesh(result.result_body_id, result.mesh);

      // Исходные тела получили visible=false на сервере — прячем и в сцене
      viewportRef.value?.setMeshVisibility(targetId.value, false);
      viewportRef.value?.setMeshVisibility(toolId.value, false);

      targetId.value = null;
      toolId.value = null;
      documentStore.markDirty();
      await documentStore.load(projectId);
    }
  }

  function clear() {
    targetId.value = null;
    toolId.value = null;
    viewportRef.value?.clearBodySelection();
    error.value = null;
  }

  const tool: EditorTool = { actions: ["boolean"], active: booleanMode, loading, busyLabel: "Булева операция…", enter, exit };

  return {
    tool,
    booleanMode,
    targetId,
    toolId,
    operation,
    availableBodies,
    loading,
    error,
    enter,
    exit,
    setOperation,
    selectTarget,
    selectTool,
    handleBodySelected,
    handleBodyDeselected,
    apply,
    clear,
  };
}

export type BooleanModeApi = ReturnType<typeof useBooleanMode>;
