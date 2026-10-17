import { computed, ref, watch } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useOperationSketches } from "@/composables/shared/useOperationSketches";
import { useSelection } from "@/composables/shared/useSelection";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { toast } from "@/composables/useToast";
import type { BrowserExtrudeOperation } from "@/lib/browserBoolean";
import {
  defaultLoftSketches,
  loftSetupError,
  movedLoftProfile,
  withLoftProfile,
  withoutLoftProfile,
  type LoftSketchCandidate,
  type LoftTransition,
} from "@/lib/browserLoftSetup";
import { isBrowserBody } from "./browserShapeHydration";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { BrowserLoftOptions } from "./useBrowserGeometry";
import type { useDocumentModel } from "./useDocumentModel";
import type { EditorTool } from "./useEditorTools";
import { useLoftPreview } from "./useLoftPreview";
import { placementOf } from "./useSweep";
import type { ViewportRef } from "./types";

export interface LoftSettings {
  profileSketchIds?: string[];
  operation?: BrowserExtrudeOperation;
  targetBodyId?: string | null;
  ruled?: boolean;
}

export function useLoft(deps: { projectId: string; viewportRef: ViewportRef; meshes: BodyMeshesApi; model: ReturnType<typeof useDocumentModel> }) {
  const { projectId, meshes, model } = deps;
  const documentStore = useDocument();
  const selection = useSelection();
  const undoRedo = useUndoRedo();
  const names = useDisplayNames();

  const loftMode = ref(false);
  const profileSketchIds = ref<string[]>([]);
  useOperationSketches().track("loft", () => (loftMode.value ? profileSketchIds.value : []));
  const operation = ref<BrowserExtrudeOperation>("new_body");
  const targetBodyId = ref<string | null>(null);
  const transition = ref<LoftTransition>("smooth");
  const loading = ref(false);
  const error = ref<string | null>(null);

  const candidates = computed<LoftSketchCandidate[]>(() => model.sketches.value.map((sketch) => ({
    id: sketch.id,
    label: names.sketchLabel(sketch.id),
    placement: placementOf(sketch),
    used: model.sketchHasFeature(sketch.id),
  })));

  const profiles = computed(() => profileSketchIds.value
    .map((id) => candidates.value.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is LoftSketchCandidate => candidate !== undefined));

  const addOptions = computed(() => candidates.value
    .filter((candidate) => !profileSketchIds.value.includes(candidate.id))
    .map((candidate) => ({ value: candidate.id, label: candidate.label })));

  const targetOptions = computed(() => meshes.meshBodies.value
    .filter((body) => isBrowserBody({ id: body.body_id, ...(documentStore.document.value?.components?.[body.body_id] as object | undefined) }))
    .map((body) => ({ value: body.body_id, label: names.bodyLabel(body.body_id) })));

  const setupError = computed(() => loftSetupError({ profiles: profiles.value, operation: operation.value, targetBodyId: targetBodyId.value }));

  const request = computed<BrowserLoftOptions | null>(() => {
    if (!loftMode.value || setupError.value) return null;
    return {
      sections: profiles.value.map((profile) => profile.placement),
      ruled: transition.value === "ruled",
      operation: operation.value,
      targetBodyId: operation.value === "new_body" ? null : targetBodyId.value,
    };
  });

  const preview = useLoftPreview({ viewportRef: deps.viewportRef, request, busy: loading });

  function selectedSketchId(): string | null {
    const entry = model.timelineEntries.value.find((candidate) => candidate.id === selection.selectedFeatureId.value);
    return entry?.kind === "sketch" ? entry.sketch_id ?? null : null;
  }

  watch(() => selection.selectedFeatureId.value, () => {
    const sketchId = loftMode.value ? selectedSketchId() : null;
    if (sketchId) profileSketchIds.value = withLoftProfile(profileSketchIds.value, sketchId);
  });

  function enter() {
    if (model.sketches.value.length < 2) {
      toast("Для лофта нужны минимум два эскиза с замкнутыми контурами на разных плоскостях", "info");
      return;
    }
    profileSketchIds.value = defaultLoftSketches(candidates.value, selectedSketchId());
    operation.value = "new_body";
    targetBodyId.value = null;
    transition.value = "smooth";
    error.value = null;
    loftMode.value = true;
  }

  function exit() {
    loftMode.value = false;
    profileSketchIds.value = [];
    targetBodyId.value = null;
    error.value = null;
    preview.hide();
  }

  function setOperation(next: BrowserExtrudeOperation) {
    operation.value = next;
    if (next !== "new_body" && !targetBodyId.value) targetBodyId.value = targetOptions.value[0]?.value ?? null;
  }

  function addProfile(sketchId: string) {
    profileSketchIds.value = withLoftProfile(profileSketchIds.value, sketchId);
  }

  function removeProfile(index: number) {
    profileSketchIds.value = withoutLoftProfile(profileSketchIds.value, index);
  }

  function moveProfile(index: number, step: -1 | 1) {
    profileSketchIds.value = movedLoftProfile(profileSketchIds.value, index, step);
  }

  function configure(settings: LoftSettings) {
    if (settings.profileSketchIds !== undefined) profileSketchIds.value = [...settings.profileSketchIds];
    if (settings.operation !== undefined) setOperation(settings.operation);
    if (settings.targetBodyId !== undefined) targetBodyId.value = settings.targetBodyId;
    if (settings.ruled !== undefined) transition.value = settings.ruled ? "ruled" : "smooth";
  }

  async function apply() {
    error.value = setupError.value;
    const options = request.value;
    if (error.value || !options) return;
    loading.value = true;
    try {
      const { BrowserLoftCommand } = await import("@/core/commands/BrowserLoftCommand");
      const command = new BrowserLoftCommand(
        projectId,
        profiles.value.map((profile) => profile.id),
        options,
        documentStore.version.value,
        () => documentStore.document.value,
        (bodyId) => meshes.untrackMesh(bodyId),
      );
      await undoRedo.execute(command);
      const result = command.getResult();
      if (result) meshes.trackMesh(result.bodyId, result.mesh);
      exit();
      documentStore.markDirty();
      await documentStore.load(projectId);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Не удалось построить лофт.";
    } finally {
      loading.value = false;
    }
  }

  const tool: EditorTool = { actions: ["loft"], active: loftMode, loading, busyLabel: "Лофт…", enter, exit };

  return {
    tool,
    loftMode,
    profileSketchIds,
    profiles,
    operation,
    targetBodyId,
    transition,
    loading,
    error,
    setupError,
    addOptions,
    targetOptions,
    enter,
    exit,
    setOperation,
    addProfile,
    removeProfile,
    moveProfile,
    configure,
    apply,
  };
}

export type LoftApi = ReturnType<typeof useLoft>;
