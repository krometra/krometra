import { computed, ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useSelection } from "@/composables/shared/useSelection";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { toast } from "@/composables/useToast";
import type { BrowserExtrudeOperation } from "@/lib/browserBoolean";
import type { BrowserSweepOrientation, SweepSketchPlacement } from "@/lib/browserSweepPath";
import { defaultSweepSketches, sweepSetupError, type SweepSketchCandidate } from "@/lib/browserSweepSetup";
import type { PlaneBasis, SketchEntity, SketchPlane } from "@/types/api";
import { isBrowserBody } from "./browserShapeHydration";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { ComponentEntry, useDocumentModel } from "./useDocumentModel";

export interface SweepSettings {
  profileSketchId?: string;
  pathSketchId?: string;
  operation?: BrowserExtrudeOperation;
  targetBodyId?: string | null;
  orientation?: BrowserSweepOrientation;
}

function placementOf(sketch: ComponentEntry): SweepSketchPlacement {
  return {
    entities: (sketch.entities as SketchEntity[]) ?? [],
    plane: (sketch.plane as SketchPlane) ?? "XY",
    planeOffset: typeof sketch.plane_offset === "number" ? sketch.plane_offset : 0,
    planeBasis: (sketch.plane_basis as PlaneBasis | null) ?? null,
  };
}

export function useSweep(deps: { projectId: string; meshes: BodyMeshesApi; model: ReturnType<typeof useDocumentModel> }) {
  const { projectId, meshes, model } = deps;
  const documentStore = useDocument();
  const selection = useSelection();
  const undoRedo = useUndoRedo();
  const names = useDisplayNames();

  const sweepMode = ref(false);
  const profileSketchId = ref<string | null>(null);
  const pathSketchId = ref<string | null>(null);
  const operation = ref<BrowserExtrudeOperation>("new_body");
  const targetBodyId = ref<string | null>(null);
  const orientation = ref<BrowserSweepOrientation>("corrected");
  const loading = ref(false);
  const error = ref<string | null>(null);

  const candidates = computed<SweepSketchCandidate[]>(() => model.sketches.value.map((sketch) => ({
    id: sketch.id,
    placement: placementOf(sketch),
    used: model.sketchHasFeature(sketch.id),
  })));

  const sketchOptions = computed(() => model.sketches.value.map((sketch) => ({ value: sketch.id, label: names.sketchLabel(sketch.id) })));

  const targetOptions = computed(() => meshes.meshBodies.value
    .filter((body) => isBrowserBody({ id: body.body_id, ...(documentStore.document.value?.components?.[body.body_id] as object | undefined) }))
    .map((body) => ({ value: body.body_id, label: names.bodyLabel(body.body_id) })));

  const candidate = (sketchId: string | null) => candidates.value.find((entry) => entry.id === sketchId) ?? null;

  const setupError = computed(() => sweepSetupError({
    profile: candidate(profileSketchId.value),
    path: candidate(pathSketchId.value),
    operation: operation.value,
    targetBodyId: targetBodyId.value,
  }));

  function selectedSketchId(): string | null {
    const entry = model.timelineEntries.value.find((candidateEntry) => candidateEntry.id === selection.selectedFeatureId.value);
    return entry?.kind === "sketch" ? entry.sketch_id ?? null : null;
  }

  function enter() {
    if (model.sketches.value.length < 2) {
      toast("Для протяжки нужны два эскиза: замкнутый профиль и путь на другой плоскости", "info");
      return;
    }
    const choice = defaultSweepSketches(candidates.value, selectedSketchId());
    profileSketchId.value = choice.profileSketchId;
    pathSketchId.value = choice.pathSketchId;
    operation.value = "new_body";
    targetBodyId.value = null;
    orientation.value = "corrected";
    error.value = null;
    sweepMode.value = true;
  }

  function exit() {
    sweepMode.value = false;
    profileSketchId.value = null;
    pathSketchId.value = null;
    targetBodyId.value = null;
    error.value = null;
  }

  function setOperation(next: BrowserExtrudeOperation) {
    operation.value = next;
    if (next !== "new_body" && !targetBodyId.value) targetBodyId.value = targetOptions.value[0]?.value ?? null;
  }

  function configure(settings: SweepSettings) {
    if (settings.profileSketchId !== undefined) profileSketchId.value = settings.profileSketchId;
    if (settings.pathSketchId !== undefined) pathSketchId.value = settings.pathSketchId;
    if (settings.operation !== undefined) setOperation(settings.operation);
    if (settings.targetBodyId !== undefined) targetBodyId.value = settings.targetBodyId;
    if (settings.orientation !== undefined) orientation.value = settings.orientation;
  }

  async function apply() {
    const profile = candidate(profileSketchId.value);
    const path = candidate(pathSketchId.value);
    error.value = setupError.value;
    if (error.value || !profile || !path) return;
    loading.value = true;
    try {
      const { BrowserSweepCommand } = await import("@/core/commands/BrowserSweepCommand");
      const command = new BrowserSweepCommand(
        projectId,
        { profileSketchId: profile.id, pathSketchId: path.id },
        profile.placement,
        {
          path: path.placement,
          orientation: orientation.value,
          operation: operation.value,
          targetBodyId: operation.value === "new_body" ? null : targetBodyId.value,
        },
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
      error.value = err instanceof Error ? err.message : "Не удалось построить протяжку.";
    } finally {
      loading.value = false;
    }
  }

  return {
    sweepMode,
    profileSketchId,
    pathSketchId,
    operation,
    targetBodyId,
    orientation,
    loading,
    error,
    setupError,
    sketchOptions,
    targetOptions,
    enter,
    exit,
    setOperation,
    configure,
    apply,
  };
}

export type SweepApi = ReturnType<typeof useSweep>;
