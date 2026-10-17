import { computed, ref, type Ref } from "vue";
import { useBodyPick } from "@/composables/shared/useBodyPick";
import { useDocument } from "@/composables/shared/useDocument";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { pickedForCombine, withCombineTarget, withCombineTool, type CombinePick } from "@/lib/bodyPickList";
import type { BooleanOperation } from "@/types/api";
import { isBrowserBody } from "./browserShapeHydration";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { SelectionMode, ViewportRef } from "./types";
import type { EditorTool } from "./useEditorTools";

const EMPTY_PICK: CombinePick = { targetId: null, toolIds: [] };

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
  const bodyPick = useBodyPick();

  const booleanMode = ref(false);
  const pick = ref<CombinePick>(EMPTY_PICK);
  const targetId = computed(() => pick.value.targetId);
  const toolIds = computed(() => pick.value.toolIds);
  const operation = ref<BooleanOperation>("union");
  const keepTools = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const availableBodies = computed(() =>
    meshes.meshBodies.value.map((b) => ({
      id: b.body_id,
      label: names.bodyLabel(b.body_id),
    })),
  );

  function setPick(next: CombinePick) {
    pick.value = next;
    viewportRef.value?.setBodyRoles(next);
  }

  function pickBody(bodyId: string) {
    setPick(pickedForCombine(pick.value, bodyId));
  }

  function enter() {
    booleanMode.value = true;
    viewportSelectionMode.value = "body";
    bodyPick.claim(pickBody);
  }

  function clear() {
    setPick(EMPTY_PICK);
    error.value = null;
  }

  function exit() {
    booleanMode.value = false;
    viewportSelectionMode.value = "face";
    bodyPick.release(pickBody);
    keepTools.value = false;
    clear();
  }

  function setOperation(next: BooleanOperation) {
    operation.value = next;
  }

  function setKeepTools(next: boolean) {
    keepTools.value = next;
  }

  function selectTarget(id: string) {
    setPick(withCombineTarget(pick.value, id));
  }

  function selectTool(id: string) {
    setPick(withCombineTool(pick.value, id));
  }

  function removeTool(id: string) {
    setPick({ targetId: pick.value.targetId, toolIds: pick.value.toolIds.filter((toolId) => toolId !== id) });
  }

  function handleBodyPicked(bodyId: string) {
    if (booleanMode.value) pickBody(bodyId);
  }

  function onSelectionCleared() {
    if (booleanMode.value) setPick(EMPTY_PICK);
  }

  function isBrowserBodyId(bodyId: string) {
    const component = documentStore.document.value?.components?.[bodyId];
    return isBrowserBody({ id: bodyId, ...(component as object | undefined) });
  }

  async function executeBoolean(targetBodyId: string, toolBodyIds: string[]) {
    if (![targetBodyId, ...toolBodyIds].every(isBrowserBodyId)) {
      error.value = "Булева операция доступна только для тел браузерного ядра.";
      return null;
    }
    loading.value = true;
    error.value = null;
    try {
      const { BrowserBooleanCommand } = await import("@/core/commands/BrowserBooleanCommand");
      const command = new BrowserBooleanCommand(
        projectId,
        { operation: operation.value, targetBodyId, toolBodyIds, keepTools: keepTools.value },
        () => documentStore.document.value,
      );
      await undoRedo.execute(command);
      return command.getResult();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Не удалось выполнить булеву операцию в браузере.";
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function apply() {
    const { targetId: target, toolIds: tools } = pick.value;
    if (!target || tools.length === 0) return;
    const result = await executeBoolean(target, tools);
    if (!result) return;
    meshes.trackMesh(result.bodyId, result.mesh);
    const hidden = keepTools.value ? [target] : [target, ...tools];
    setPick(EMPTY_PICK);
    hidden.forEach((bodyId) => viewportRef.value?.setMeshVisibility(bodyId, false));
    documentStore.markDirty();
    await documentStore.load(projectId);
  }

  const tool: EditorTool = {
    actions: ["boolean"],
    active: booleanMode,
    loading,
    busyLabel: "Булева операция…",
    enter,
    exit,
    onSelectionCleared,
  };

  return {
    tool,
    booleanMode,
    targetId,
    toolIds,
    operation,
    keepTools,
    availableBodies,
    loading,
    error,
    enter,
    exit,
    setOperation,
    setKeepTools,
    selectTarget,
    selectTool,
    removeTool,
    handleBodyPicked,
    apply,
    clear,
  };
}

export type BooleanModeApi = ReturnType<typeof useBooleanMode>;
