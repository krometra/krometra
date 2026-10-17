import { computed, ref, type Ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useSelection } from "@/composables/shared/useSelection";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { useParameters } from "@/composables/useParameters";
import { apiErrorMessage } from "@/composables/useToast";
import { browserFacePlane } from "@/lib/browserFacePlane";
import {
  DEFAULT_DRAFT_ANGLE_DEG,
  draftAngleError,
  toggleDraftFaces,
  type BrowserDraftFeature,
  type DraftBasePlane,
  type DraftFaceSelection,
  type DraftNeutral,
} from "@/lib/browserDraft";
import { shellFaceRows } from "@/lib/browserShell";
import { tangentFaceChain } from "@/lib/faceTangentChain";
import { parameterQuantities } from "@/lib/units";
import type { MeshData } from "@/types/api";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { SelectionMode, ViewportRef } from "./types";
import type { EditorTool, FacePick } from "./useEditorTools";
import { useQuantityField } from "./useQuantityField";

export type DraftNeutralSource = "base" | "face";

const EMPTY: DraftFaceSelection = { bodyId: null, faceIds: [] };

export function useDraft(deps: {
  projectId: string;
  viewportRef: ViewportRef;
  viewportSelectionMode: Ref<SelectionMode>;
  meshes: BodyMeshesApi;
}) {
  const { projectId, viewportRef, viewportSelectionMode, meshes } = deps;
  const documentStore = useDocument();
  const selection = useSelection();
  const undoRedo = useUndoRedo();
  const parameters = useParameters();

  const draftMode = ref(false);
  const bodyId = ref<string | null>(null);
  const faceIds = ref<string[]>([]);
  const neutralSource = ref<DraftNeutralSource>("base");
  const basePlane = ref<DraftBasePlane>("XY");
  const neutralFace = ref<{ bodyId: string; faceId: string } | null>(null);
  const pickingNeutral = ref(false);
  const reverse = ref(false);
  const tangentChain = ref(true);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const hint = ref<string | null>(null);
  const angle = useQuantityField({
    dimension: "angle",
    initial: DEFAULT_DRAFT_ANGLE_DEG,
    variables: () => parameterQuantities(parameters.parameters.value),
    rangeError: draftAngleError,
  });

  const neutral = computed<DraftNeutral | null>(() => {
    if (neutralSource.value === "base") return { kind: "base", plane: basePlane.value };
    return neutralFace.value ? { kind: "face", faceId: neutralFace.value.faceId } : null;
  });

  const faceRows = computed(() => shellFaceRows(meshOf(bodyId.value), faceIds.value));
  const canApply = computed(() => (
    bodyId.value !== null && faceIds.value.length > 0 && neutral.value !== null && !angle.invalid.value && !loading.value
  ));

  function meshOf(body: string | null): MeshData | null {
    return meshes.meshBodies.value.find((entry) => entry.body_id === body)?.mesh ?? null;
  }

  function setFaces(next: DraftFaceSelection) {
    bodyId.value = next.bodyId;
    faceIds.value = next.faceIds;
    const viewport = viewportRef.value;
    if (next.bodyId) viewport?.markFaces(next.bodyId, next.faceIds);
    else viewport?.clearMarkedFaces();
  }

  function resetPick() {
    error.value = null;
    hint.value = null;
    neutralFace.value = null;
    pickingNeutral.value = false;
    neutralSource.value = "base";
    setFaces(EMPTY);
  }

  function enter() {
    draftMode.value = true;
    resetPick();
    viewportSelectionMode.value = "face";
    viewportRef.value?.clearHighlight();
  }

  function exit() {
    draftMode.value = false;
    resetPick();
    viewportRef.value?.clearHighlight();
    viewportSelectionMode.value = "face";
  }

  function clear() {
    resetPick();
    viewportRef.value?.clearHighlight();
    selection.clearSelection();
  }

  function selectBasePlane(plane: DraftBasePlane) {
    neutralSource.value = "base";
    basePlane.value = plane;
    neutralFace.value = null;
    pickingNeutral.value = false;
    hint.value = null;
  }

  function startNeutralFacePick() {
    neutralSource.value = "face";
    neutralFace.value = null;
    pickingNeutral.value = true;
    hint.value = "Кликните плоскую грань тела - она останется на месте, остальные грани наклонятся от неё.";
  }

  function pickNeutralFace(body: string, face: string) {
    const mesh = meshOf(body);
    if (!mesh || !browserFacePlane(mesh, face)) {
      hint.value = "Грань не плоская - нейтралью может быть только плоская грань тела.";
      return;
    }
    neutralSource.value = "face";
    neutralFace.value = { bodyId: body, faceId: face };
    pickingNeutral.value = false;
    hint.value = null;
    const kept = bodyId.value === body ? faceIds.value.filter((id) => id !== face) : [];
    setFaces({ bodyId: kept.length > 0 ? body : null, faceIds: kept });
  }

  function faceGroup(body: string, face: string): string[] {
    const mesh = meshOf(body);
    const group = tangentChain.value && mesh ? tangentFaceChain(mesh, face) : [face];
    return group.filter((id) => id !== neutralFace.value?.faceId);
  }

  function toggleFace(body: string, face: string) {
    const current = neutralFace.value;
    if (current?.bodyId === body && current.faceId === face) {
      hint.value = "Нейтральная грань не наклоняется - выберите боковые грани.";
      return;
    }
    hint.value = null;
    if (current && current.bodyId !== body) {
      neutralFace.value = null;
      hint.value = "Нейтральная грань была на другом теле - выберите нейтраль заново.";
    }
    setFaces(toggleDraftFaces({ bodyId: bodyId.value, faceIds: faceIds.value }, body, faceGroup(body, face)));
  }

  function onFaceSelected(payload: FacePick): boolean {
    if (!draftMode.value) return false;
    error.value = null;
    if (pickingNeutral.value) pickNeutralFace(payload.bodyId, String(payload.faceId));
    else toggleFace(payload.bodyId, String(payload.faceId));
    viewportRef.value?.clearHighlight();
    return true;
  }

  function removeFace(faceId: string | number) {
    if (bodyId.value) setFaces(toggleDraftFaces({ bodyId: bodyId.value, faceIds: faceIds.value }, bodyId.value, [String(faceId)]));
  }

  function selectFaces(body: string, faces: string[]) {
    error.value = null;
    setFaces({ bodyId: faces.length > 0 ? body : null, faceIds: [...faces] });
  }

  function setNeutral(body: string, next: DraftNeutral) {
    if (next.kind === "base") {
      selectBasePlane(next.plane);
      return;
    }
    neutralSource.value = "face";
    neutralFace.value = { bodyId: body, faceId: next.faceId };
    pickingNeutral.value = false;
  }

  function setAngle(value: number) {
    angle.set(value);
  }

  function setAngleText(value: string) {
    angle.text.value = value;
    angle.onInput();
  }

  function setReverse(value: boolean) {
    reverse.value = value;
  }

  function setTangentChain(value: boolean) {
    tangentChain.value = value;
  }

  function currentFeature(): BrowserDraftFeature | null {
    angle.commit();
    const current = neutral.value;
    if (!bodyId.value || faceIds.value.length === 0 || !current || angle.invalid.value) return null;
    return { bodyId: bodyId.value, faceNames: [...faceIds.value], neutral: current, angleDeg: angle.value.value, reverse: reverse.value };
  }

  async function apply() {
    const feature = currentFeature();
    if (!feature || loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      const { BrowserDraftCommand } = await import("@/core/commands/BrowserDraftCommand");
      const command = new BrowserDraftCommand(projectId, feature, () => documentStore.document.value);
      await undoRedo.execute(command);
      const result = command.getResult();
      if (!result) throw new Error("Уклон не сохранён.");
      result.hiddenBodyIds.forEach((hidden) => meshes.untrackMesh(hidden));
      meshes.trackMesh(result.bodyId, result.mesh);
      documentStore.markDirty();
      await documentStore.load(projectId);
      exit();
    } catch (err) {
      error.value = apiErrorMessage(err, "Не удалось построить уклон");
    } finally {
      loading.value = false;
    }
  }

  const tool: EditorTool = { actions: ["draft"], active: draftMode, loading, busyLabel: "Построение уклона…", enter, exit, onFaceSelected };

  return {
    tool,
    draftMode,
    bodyId,
    faceIds,
    faceRows,
    neutralSource,
    basePlane,
    neutralFace,
    pickingNeutral,
    reverse,
    tangentChain,
    angle,
    loading,
    error,
    hint,
    canApply,
    enter,
    exit,
    clear,
    selectBasePlane,
    startNeutralFacePick,
    onFaceSelected,
    removeFace,
    selectFaces,
    setNeutral,
    setAngle,
    setAngleText,
    setReverse,
    setTangentChain,
    apply,
  };
}

export type DraftApi = ReturnType<typeof useDraft>;
