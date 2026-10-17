import { nextTick, ref, watch, type Ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useSketch } from "@/composables/shared/useSketch";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { apiErrorMessage, toast } from "@/composables/useToast";
import { deleteSketch as deleteSketchEntry } from "@/lib/bodyHistory";
import { browserFaceBoundary, browserFacePlane } from "@/lib/browserFacePlane";
import { faceBoundaryEntities } from "@/lib/faceBoundary";
import { workPlaneOf } from "@/lib/workPlaneDocument";
import { FACE_EDGE_ID_PREFIX } from "@/sketcher/sketchOrigin";
import type SketcherContainer from "@/components/sketcher/SketcherContainer.vue";
import type { SketchConstraint, SketchEntity, SketchLine, SketchPlane } from "@/types/api";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { useDocumentModel } from "./useDocumentModel";
import type { ExtrudeRevolveApi } from "./useExtrudeRevolve";
import type { ModelHistoryApi } from "./useModelHistory";
import type { SelectionMode, ViewportRef } from "./types";
import { rebuildSketchDependents } from "./sketchRebuild";

export function useSketchLifecycle(deps: {
  projectId: string;
  viewportRef: ViewportRef;
  sketcherRef: Ref<InstanceType<typeof SketcherContainer> | null>;
  viewportSelectionMode: Ref<SelectionMode>;
  meshes: BodyMeshesApi;
  model: ReturnType<typeof useDocumentModel>;
  extrude: ExtrudeRevolveApi;
  history: ModelHistoryApi;
}) {
  const { projectId, viewportRef, sketcherRef, viewportSelectionMode, meshes, model, extrude, history } = deps;
  const documentStore = useDocument();
  const sketch = useSketch();
  const names = useDisplayNames();
  const undoRedo = useUndoRedo();

  // --- Sketch start: pick a base plane or a body face in the viewport ---
  const facePickMode = ref(false);
  const facePickError = ref<string | null>(null);
  const canvasSketchId = ref<string | null>(null);
  const finishing = ref(false);
  let pendingConstructionEntities: SketchEntity[] | null = null;

  function beginPlanePick() {
    facePickMode.value = true;
    facePickError.value = null;
    viewportSelectionMode.value = "face";
    viewportRef.value?.showPlaneHelpers();
  }

  function cancelFacePick() {
    facePickMode.value = false;
    facePickError.value = null;
    viewportRef.value?.hidePlaneHelpers();
    viewportRef.value?.clearHighlight();
  }

  function onPlanePicked(payload: { plane: SketchPlane; offset?: number }) {
    if (!facePickMode.value) return;
    facePickMode.value = false;
    facePickError.value = null;
    viewportRef.value?.hidePlaneHelpers();
    sketch.setPlane(payload.plane, payload.offset ?? 0);
    sketch.startSketch(`sketch-${Date.now()}`);
  }

  function startOnWorkPlane(planeId: string) {
    const plane = workPlaneOf(documentStore.document.value?.components ?? {}, planeId);
    facePickMode.value = false;
    facePickError.value = null;
    viewportRef.value?.hidePlaneHelpers();
    viewportRef.value?.clearHighlight();
    sketch.setWorkPlane(plane.plane, plane.plane_offset, plane.plane_basis, planeId);
    sketch.startSketch(`sketch-${Date.now()}`);
  }

  function onWorkPlanePicked(planeId: string) {
    if (facePickMode.value) startOnWorkPlane(planeId);
  }

  function boundaryToConstructionLines(boundary: { x: number; y: number }[][], faceId: string | number): SketchLine[] {
    const lines: SketchLine[] = [];
    let i = 0;
    for (const polyline of boundary) {
      for (let p = 0; p < polyline.length - 1; p++) {
        const start = polyline[p];
        const end = polyline[p + 1];
        if (Math.hypot(end.x - start.x, end.y - start.y) < 1e-6) continue;
        lines.push({
          id: `${FACE_EDGE_ID_PREFIX}${faceId}-${i++}`,
          type: "line",
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y },
          construction: true,
        });
      }
    }
    return lines;
  }

  function handleFaceSketchStart(payload: { bodyId: string; faceId: string | number }) {
    const mesh = meshes.meshBodies.value.find((body) => body.body_id === payload.bodyId)?.mesh;
    const face = mesh && browserFacePlane(mesh, payload.faceId);
    if (!face) {
      facePickError.value = "Эта грань не плоская или ещё не загружена.";
      return;
    }
    facePickMode.value = false;
    facePickError.value = null;
    viewportRef.value?.hidePlaneHelpers();
    viewportRef.value?.clearHighlight();
    sketch.setFacePlane(face.plane, face.planeOffset, face.basis, payload.bodyId, payload.faceId);
    pendingConstructionEntities =
      faceBoundaryEntities(mesh, payload.faceId, face.basis) ??
      boundaryToConstructionLines(browserFaceBoundary(mesh, payload.faceId, face.basis), payload.faceId);
    sketch.startSketch(`sketch-${Date.now()}`);
  }

  async function handleSketchOk() {
    if (!sketch.activeSketchId.value) {
      sketch.exitSketch();
      return;
    }
    finishing.value = true;
    try {
      await saveAndLeaveSketch(sketch.activeSketchId.value);
    } finally {
      finishing.value = false;
    }
  }

  async function saveAndLeaveSketch(sketchId: string) {
    const { SketchSaveCommand } = await import("@/core/commands/SketchSaveCommand");
    try {
      await undoRedo.execute(new SketchSaveCommand(projectId, sketchId, () => sketch.saveSketchData(projectId, sketchId)));
    } catch (error) {
      toast(apiErrorMessage(error, "Не удалось сохранить эскиз"), "error");
      return;
    }
    sketch.exitSketch();
    await documentStore.load(projectId);

    extrude.clearSketchContext();
    const deps = model.dependentFeatures(sketchId);
    if (deps.length > 0) {
      const labels = deps.map((dep) => `«${names.entryLabel(dep)}»`).join(", ");
      try {
        await rebuildSketchDependents(projectId, sketchId);
        await documentStore.load(projectId);
        toast(`Эскиз сохранён, ${labels} перестроены.`, "success");
      } catch (error) {
        toast(`Эскиз сохранён, но ${labels} не перестроены: ${apiErrorMessage(error, "ошибка браузерного ядра")}`, "warning");
      }
    }

    await nextTick();
    await meshes.hydrateBodyMeshes();
  }

  function handleSketchCancel() {
    sketch.exitSketch();
  }

  function handleSketchChanged(data: { entities: unknown[]; constraints?: unknown[] }) {
    // Одно редактирование канвы — одна запись в истории: раздельные
    // setEntities/setConstraints давали два шага, и Ctrl+Z «залипал».
    sketch.applyCanvasEdit(
      data.entities as SketchEntity[],
      data.constraints as SketchConstraint[] | undefined,
    );
  }

  function editSketch(sketchId: string) {
    if (sketch.sketchMode.value) return;
    extrude.clearSketchContext();
    sketch.startSketch(sketchId);
  }

  async function removeSketch(sketchId: string) {
    const label = `Удалить ${names.sketchLabel(sketchId)}`;
    if (extrude.lastSavedSketchId.value === sketchId) extrude.clearSketchContext();
    return history.edit(label, (document) => deleteSketchEntry(document, sketchId, names.entryLabel));
  }

  async function deleteSketch(sketchId: string) {
    try {
      await removeSketch(sketchId);
      toast("Эскиз удалён", "success");
    } catch (error) {
      toast(apiErrorMessage(error, "Не удалось удалить эскиз"), "warning");
    }
  }

  // Load existing sketch when (re-)entering; hydrate the sketcher canvas.
  // Новый эскиз в document.components ещё отсутствует — GET дал бы ожидаемый 404,
  // который шумит в консоли как ошибка, поэтому для него запроса нет.
  watch(() => sketch.activeSketchId.value, async (sketchId) => {
    canvasSketchId.value = null;
    if (sketchId) {
      const exists = Boolean(documentStore.document.value?.components?.[sketchId]);
      if (exists) {
        await sketch.loadSketchData(projectId, sketchId);
      }
      if (pendingConstructionEntities && sketch.entities.value.length === 0) {
        sketch.setEntities(pendingConstructionEntities);
      }
      pendingConstructionEntities = null;
      await nextTick();
      sketcherRef.value?.loadSketch({
        plane: sketch.sketchPlane.value,
        plane_offset: sketch.planeOffset.value,
        entities: sketch.entities.value,
        constraints: sketch.constraints.value,
      });
      if (sketch.activeSketchId.value === sketchId) canvasSketchId.value = sketchId;
    }
  });

  return {
    facePickMode,
    facePickError,
    canvasSketchId,
    finishing,
    beginPlanePick,
    cancelFacePick,
    onPlanePicked,
    handleFaceSketchStart,
    startOnWorkPlane,
    onWorkPlanePicked,
    handleSketchOk,
    handleSketchCancel,
    handleSketchChanged,
    editSketch,
    removeSketch,
    deleteSketch,
  };
}

export type SketchLifecycleApi = ReturnType<typeof useSketchLifecycle>;
