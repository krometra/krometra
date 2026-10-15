import { computed, ref, watch, type Ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useSelection } from "@/composables/shared/useSelection";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { apiErrorMessage } from "@/composables/useToast";
import { browserFacePlane, browserFacePoints } from "@/lib/browserFacePlane";
import { holeSketchPlacement, type HoleTarget } from "@/lib/holeFeature";
import {
  bboxCorners,
  DEFAULT_HOLE_SPEC,
  distinctCenters,
  holePreviews,
  projectOntoPlane,
  sketchHoleCenters,
  validateHoleSpec,
  type HolePreview,
  type HoleSpec,
} from "@/lib/holeGeometry";
import type { Vec3 } from "@/lib/threadGeometry";
import { scale } from "@/lib/vec3";
import type { BrepTopo } from "@/types/api";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { useDocumentModel } from "./useDocumentModel";
import type { SelectionMode, ViewportRef } from "./types";

interface HoleFacePick {
  bodyId: string;
  faceId: string | number;
  brepTopo: BrepTopo;
  point?: Vec3;
}

export function useHole(deps: {
  projectId: string;
  viewportRef: ViewportRef;
  viewportSelectionMode: Ref<SelectionMode>;
  meshes: BodyMeshesApi;
  model: ReturnType<typeof useDocumentModel>;
}) {
  const { projectId, viewportRef, viewportSelectionMode, meshes, model } = deps;
  const documentStore = useDocument();
  const selection = useSelection();
  const undoRedo = useUndoRedo();
  const names = useDisplayNames();

  const holeMode = ref(false);
  const bodyId = ref<string | null>(null);
  const faceId = ref<string | number | null>(null);
  const facePlane = ref<{ origin: Vec3; normal: Vec3 } | null>(null);
  const clickedCenters = ref<Vec3[]>([]);
  const sketchId = ref<string | null>(null);
  const spec = ref<HoleSpec>({ ...DEFAULT_HOLE_SPEC });
  const loading = ref(false);
  const error = ref<string | null>(null);

  const faceHint = computed(() => (bodyId.value && !facePlane.value ? "Отверстие ставится только на плоскую грань — выберите другую." : null));

  const sketchOptions = computed(() => model.sketches.value
    .filter((sketch) => holeSketchPlacement(sketch) !== null)
    .map((sketch) => ({ id: sketch.id, label: names.sketchLabel(sketch.id) })));

  const sketchPlacement = computed(() => {
    const sketch = model.sketches.value.find((candidate) => candidate.id === sketchId.value);
    return sketch ? holeSketchPlacement(sketch) : null;
  });

  const centers = computed<Vec3[]>(() => {
    const plane = facePlane.value;
    if (!plane) return [];
    const source = sketchPlacement.value ? sketchHoleCenters(sketchPlacement.value) : clickedCenters.value;
    return distinctCenters(source.map((point) => projectOntoPlane(point, plane.origin, plane.normal)));
  });

  const specError = computed(() => {
    try {
      validateHoleSpec(spec.value);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Недопустимые размеры отверстия.";
    }
  });

  function bodyMesh(body: string | null) {
    return meshes.meshBodies.value.find((entry) => entry.body_id === body)?.mesh ?? null;
  }

  function previews(): HolePreview[] {
    const plane = facePlane.value;
    const mesh = bodyMesh(bodyId.value);
    if (!holeMode.value || !plane || !mesh || specError.value) return [];
    return holePreviews(spec.value, centers.value, scale(plane.normal, -1), bboxCorners(mesh.bbox.min, mesh.bbox.max));
  }

  watch([centers, spec, holeMode], () => viewportRef.value?.showHolePreview(previews()), { deep: true });

  function reset() {
    bodyId.value = null;
    faceId.value = null;
    facePlane.value = null;
    clickedCenters.value = [];
    sketchId.value = null;
    error.value = null;
  }

  function enter() {
    holeMode.value = true;
    reset();
    viewportSelectionMode.value = "face";
    viewportRef.value?.clearHighlight();
  }

  function exit() {
    holeMode.value = false;
    reset();
    viewportRef.value?.hideHolePreview();
    viewportRef.value?.clearHighlight();
    viewportSelectionMode.value = "face";
  }

  function selectFace(pick: HoleFacePick) {
    if (pick.bodyId === bodyId.value && pick.faceId === faceId.value) return;
    const mesh = bodyMesh(pick.bodyId);
    const plane = mesh ? browserFacePlane(mesh, pick.faceId) : null;
    bodyId.value = pick.bodyId;
    faceId.value = pick.faceId;
    facePlane.value = plane ? { origin: plane.basis.origin as Vec3, normal: plane.basis.n as Vec3 } : null;
    clickedCenters.value = [];
    error.value = null;
    selection.selectFace(pick.bodyId, pick.faceId, pick.brepTopo);
  }

  function addCenter(point: Vec3) {
    clickedCenters.value = [...clickedCenters.value, point];
  }

  function removeCenter(index: number) {
    clickedCenters.value = clickedCenters.value.filter((_, position) => position !== index);
  }

  function clearCenters() {
    clickedCenters.value = [];
  }

  function setSketch(id: string | null) {
    sketchId.value = id;
  }

  function updateSpec(patch: Partial<HoleSpec>) {
    spec.value = { ...spec.value, ...patch };
  }

  function onFaceSelected(pick: HoleFacePick): boolean {
    if (!holeMode.value) return false;
    selectFace(pick);
    if (pick.point && !sketchId.value) addCenter(pick.point);
    return true;
  }

  function holeTarget(): HoleTarget | null {
    const mesh = bodyMesh(bodyId.value);
    if (!bodyId.value || faceId.value === null || !mesh || centers.value.length === 0) return null;
    const placement = sketchPlacement.value;
    return {
      bodyId: bodyId.value,
      faceId: faceId.value,
      facePoints: browserFacePoints(mesh, faceId.value, 12),
      centers: centers.value,
      sketch: placement && sketchId.value ? { ...placement, sketchId: sketchId.value } : null,
    };
  }

  async function apply() {
    const target = holeTarget();
    if (!target || specError.value || loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      const { BrowserHoleCommand } = await import("@/core/commands/BrowserHoleCommand");
      const command = new BrowserHoleCommand(projectId, target, { ...spec.value }, () => documentStore.document.value);
      await undoRedo.execute(command);
      const result = command.getResult();
      if (result) meshes.replaceMesh(result.bodyId, result.mesh);
      if (result && result.bodyId !== target.bodyId) viewportRef.value?.setMeshVisibility(target.bodyId, false);
      documentStore.markDirty();
      await documentStore.load(projectId);
      exit();
    } catch (err) {
      error.value = apiErrorMessage(err, "Не удалось построить отверстие");
    } finally {
      loading.value = false;
    }
  }

  return {
    holeMode,
    bodyId,
    faceId,
    facePlane,
    faceHint,
    clickedCenters,
    centers,
    sketchId,
    sketchOptions,
    spec,
    specError,
    loading,
    error,
    enter,
    exit,
    selectFace,
    addCenter,
    removeCenter,
    clearCenters,
    setSketch,
    updateSpec,
    onFaceSelected,
    apply,
  };
}

export type HoleApi = ReturnType<typeof useHole>;
