import { computed, ref, watch, type Ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useSelection } from "@/composables/shared/useSelection";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { apiErrorMessage } from "@/composables/useToast";
import { browserFacePlane } from "@/lib/browserFacePlane";
import { basePlaneFrame, type MirrorBasePlane, type MirrorFrame, type MirrorPlane } from "@/lib/mirrorPlane";
import type { Vec3 } from "@/lib/threadGeometry";
import type { BrepTopo } from "@/types/api";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { SelectionMode, ViewportRef } from "./types";
import type { EditorTool } from "./useEditorTools";

export type MirrorPlaneSource = "base" | "face";

export function useMirror(deps: {
  projectId: string;
  viewportRef: ViewportRef;
  viewportSelectionMode: Ref<SelectionMode>;
  meshes: BodyMeshesApi;
}) {
  const documentStore = useDocument();
  const selection = useSelection();
  const undoRedo = useUndoRedo();

  const mirrorMode = ref(false);
  const bodyId = ref<string | null>(null);
  const planeSource = ref<MirrorPlaneSource>("base");
  const basePlane = ref<MirrorBasePlane>("YZ");
  const offset = ref(0);
  const faceId = ref<string | null>(null);
  const merge = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const faceHint = ref<string | null>(null);

  const plane = computed<MirrorPlane | null>(() => {
    if (planeSource.value === "base") return { kind: "base", plane: basePlane.value, offset: offset.value };
    return faceId.value ? { kind: "face", faceId: faceId.value } : null;
  });

  const canApply = computed(() => bodyId.value !== null && plane.value !== null && !loading.value);

  function faceFrame(body: string, face: string): MirrorFrame | null {
    const mesh = deps.meshes.meshBodies.value.find((entry) => entry.body_id === body)?.mesh;
    const facePlane = mesh ? browserFacePlane(mesh, face) : null;
    return facePlane ? { origin: facePlane.basis.origin as Vec3, normal: facePlane.basis.n as Vec3 } : null;
  }

  function previewFrame(): MirrorFrame | null {
    const current = plane.value;
    if (!mirrorMode.value || !bodyId.value || !current) return null;
    return current.kind === "base" ? basePlaneFrame(current.plane, current.offset) : faceFrame(bodyId.value, current.faceId);
  }

  function refreshPreview() {
    const viewport = deps.viewportRef.value;
    if (!viewport) return;
    const frame = previewFrame();
    if (frame && bodyId.value) viewport.showMirrorPreview(bodyId.value, frame);
    else viewport.hideMirrorPreview();
  }

  watch([mirrorMode, bodyId, plane], refreshPreview);

  function clearPick() {
    bodyId.value = null;
    faceId.value = null;
    error.value = null;
    faceHint.value = null;
  }

  function enter() {
    mirrorMode.value = true;
    clearPick();
    deps.viewportSelectionMode.value = "face";
    deps.viewportRef.value?.clearHighlight();
  }

  function exit() {
    mirrorMode.value = false;
    clearPick();
    deps.viewportRef.value?.clearHighlight();
    deps.viewportRef.value?.hideMirrorPreview();
    deps.viewportSelectionMode.value = "face";
  }

  function selectBasePlane(next: MirrorBasePlane) {
    planeSource.value = "base";
    basePlane.value = next;
    faceId.value = null;
    faceHint.value = null;
  }

  function selectFacePlane() {
    planeSource.value = "face";
    faceId.value = null;
    faceHint.value = bodyId.value ? "Кликните плоскую грань тела — по ней пройдёт плоскость зеркала." : null;
  }

  function setOffset(value: number) {
    offset.value = value;
  }

  function setMerge(value: boolean) {
    merge.value = value;
  }

  function pickFace(body: string, face: string) {
    const flat = faceFrame(body, face) !== null;
    faceId.value = flat ? face : null;
    faceHint.value = flat ? null : "Грань не плоская — выберите плоскую грань тела.";
  }

  function onFaceSelected(payload: { bodyId: string; faceId: string | number; brepTopo: BrepTopo }): boolean {
    if (!mirrorMode.value) return false;
    selection.selectFace(payload.bodyId, payload.faceId, payload.brepTopo);
    bodyId.value = payload.bodyId;
    error.value = null;
    if (planeSource.value === "face") pickFace(payload.bodyId, String(payload.faceId));
    return true;
  }

  function onSelectionCleared() {
    if (mirrorMode.value) clearPick();
  }

  async function run(body: string, mirrorPlane: MirrorPlane, mergeResult: boolean): Promise<string> {
    loading.value = true;
    try {
      const { BrowserMirrorCommand } = await import("@/core/commands/BrowserMirrorCommand");
      const command = new BrowserMirrorCommand(deps.projectId, body, mirrorPlane, mergeResult, () => documentStore.document.value);
      await undoRedo.execute(command);
      const result = command.getResult();
      if (!result) throw new Error("Зеркало не сохранено.");
      result.hiddenBodyIds.forEach((hidden) => deps.meshes.untrackMesh(hidden));
      await documentStore.load(deps.projectId);
      deps.meshes.trackMesh(result.bodyId, result.mesh);
      return result.bodyId;
    } finally {
      loading.value = false;
    }
  }

  async function apply() {
    const body = bodyId.value;
    const current = plane.value;
    if (!body || !current || loading.value) return;
    error.value = null;
    try {
      await run(body, current, merge.value);
      exit();
    } catch (err) {
      error.value = apiErrorMessage(err, "Не удалось построить зеркало");
    }
  }

  const tool: EditorTool = { actions: ["mirror"], active: mirrorMode, loading, busyLabel: "Зеркало…", enter, exit, onFaceSelected, onSelectionCleared };

  return {
    tool,
    mirrorMode,
    bodyId,
    planeSource,
    basePlane,
    offset,
    faceId,
    merge,
    loading,
    error,
    faceHint,
    canApply,
    enter,
    exit,
    selectBasePlane,
    selectFacePlane,
    setOffset,
    setMerge,
    onFaceSelected,
    onSelectionCleared,
    run,
    apply,
  };
}

export type MirrorApi = ReturnType<typeof useMirror>;
