import { computed, ref, watch, type Ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useSelection } from "@/composables/shared/useSelection";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { apiErrorMessage } from "@/composables/useToast";
import type { EdgeSelectionSnapshot } from "@/composables/viewport/useEdgeSelection";
import type { PatternAxisRef, PatternMode, PatternSpec } from "@/lib/bodyPattern";
import {
  defaultPatternForm,
  patternFormError,
  patternSpecOf,
  type PatternAxisSlot,
  type PatternForm,
  type PatternPickKind,
} from "@/lib/patternForm";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { SelectionMode, ViewportRef } from "./types";
import type { EditorTool } from "./useEditorTools";

export function usePattern(deps: {
  projectId: string;
  viewportRef: ViewportRef;
  viewportSelectionMode: Ref<SelectionMode>;
  meshes: BodyMeshesApi;
}) {
  const { projectId, viewportRef, viewportSelectionMode, meshes } = deps;
  const documentStore = useDocument();
  const selection = useSelection();
  const undoRedo = useUndoRedo();
  const names = useDisplayNames();

  const patternMode = ref(false);
  const sourceBodyId = ref<string | null>(null);
  const form = ref<PatternForm>(defaultPatternForm());
  const mode = ref<PatternMode>("join");
  const picking = ref<{ slot: PatternAxisSlot; kind: PatternPickKind } | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const availableBodies = computed(() => meshes.meshBodies.value.map((body) => ({ value: body.body_id, label: names.bodyLabel(body.body_id) })));
  const formError = computed(() => patternFormError(sourceBodyId.value, form.value, mode.value));

  function initialSource(): string | null {
    const selected = selection.selection.value?.bodyId;
    if (selected && meshes.meshBodies.value.some((body) => body.body_id === selected)) return selected;
    return meshes.meshBodies.value.length === 1 ? meshes.meshBodies.value[0].body_id : null;
  }

  function stopPicking() {
    if (picking.value?.kind === "edge") {
      viewportRef.value?.clearEdgeSelection();
      viewportRef.value?.clearAllEdgeLines();
    }
    picking.value = null;
    viewportSelectionMode.value = "face";
  }

  function enter() {
    patternMode.value = true;
    error.value = null;
    sourceBodyId.value = initialSource();
    viewportSelectionMode.value = "face";
  }

  function exit() {
    stopPicking();
    patternMode.value = false;
    error.value = null;
  }

  function setSource(bodyId: string) {
    sourceBodyId.value = bodyId;
  }

  function updateForm(patch: Partial<PatternForm>) {
    form.value = { ...form.value, ...patch };
  }

  function setMode(next: PatternMode) {
    mode.value = next;
  }

  function setAxis(slot: PatternAxisSlot, axis: PatternAxisRef) {
    stopPicking();
    updateForm({ [slot]: axis });
  }

  function startPicking(slot: PatternAxisSlot, kind: PatternPickKind) {
    stopPicking();
    picking.value = { slot, kind };
    viewportSelectionMode.value = kind;
  }

  watch(() => selection.selection.value, (current) => {
    if (!patternMode.value || current?.type !== "face") return;
    if (picking.value?.kind === "face") setAxis(picking.value.slot, { kind: "face", bodyId: current.bodyId, name: String(current.faceId) });
    else if (!picking.value) sourceBodyId.value = current.bodyId;
  });

  function onEdgeSelectionChanged(snapshot: EdgeSelectionSnapshot) {
    const edgeId = snapshot.edgeIds[snapshot.edgeIds.length - 1];
    if (!patternMode.value || picking.value?.kind !== "edge" || !snapshot.bodyId || edgeId === undefined) return;
    setAxis(picking.value.slot, { kind: "edge", bodyId: snapshot.bodyId, name: String(edgeId) });
  }

  async function run(bodyId: string, spec: PatternSpec, patternResult: PatternMode): Promise<string[]> {
    loading.value = true;
    try {
      const { BrowserPatternCommand } = await import("@/core/commands/BrowserPatternCommand");
      const command = new BrowserPatternCommand(projectId, bodyId, spec, patternResult, () => documentStore.document.value);
      await undoRedo.execute(command);
      const result = command.getResult();
      if (!result) throw new Error("Массив не сохранён.");
      result.hiddenBodyIds.forEach((hidden) => meshes.untrackMesh(hidden));
      await documentStore.load(projectId);
      result.bodies.forEach((body) => meshes.trackMesh(body.bodyId, body.mesh));
      return result.bodies.map((body) => body.bodyId);
    } finally {
      loading.value = false;
    }
  }

  async function apply() {
    const spec = patternSpecOf(form.value);
    if (!sourceBodyId.value || !spec || formError.value || loading.value) return;
    error.value = null;
    try {
      await run(sourceBodyId.value, spec, mode.value);
      exit();
    } catch (err) {
      error.value = apiErrorMessage(err, "Не удалось построить массив");
    }
  }

  const tool: EditorTool = { actions: ["pattern"], active: patternMode, loading, busyLabel: "Построение массива…", enter, exit };

  return {
    tool,
    patternMode,
    sourceBodyId,
    form,
    mode,
    picking,
    loading,
    error,
    availableBodies,
    formError,
    enter,
    exit,
    setSource,
    updateForm,
    setMode,
    setAxis,
    startPicking,
    stopPicking,
    onEdgeSelectionChanged,
    run,
    apply,
  };
}

export type PatternApi = ReturnType<typeof usePattern>;
