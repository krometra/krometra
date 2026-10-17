import { computed, ref, watch, type Ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { apiErrorMessage, toast } from "@/composables/useToast";
import type { ModelDocument } from "@/lib/bodyHistory";
import { isFailed } from "@/lib/timelineFlags";
import { computeWorkPlaneFrame, frameOfPlacement, placementOfFrame, type WorkPlaneDefinition } from "@/lib/workPlane";
import {
  addWorkPlane,
  editedPlacement,
  editWorkPlane,
  newWorkPlaneId,
  nextWorkPlaneLabel,
  removeWorkPlane,
  sketchesOnPlane,
  workPlaneComponent,
  workPlaneOf,
  type WorkPlaneEntry,
} from "@/lib/workPlaneDocument";
import { meshWorkPlaneGeometry } from "@/lib/workPlaneMesh";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { BodyPresentationApi } from "./useBodyPresentation";
import type { useDocumentModel } from "./useDocumentModel";
import type { ModelHistoryApi } from "./useModelHistory";
import type { SketchLifecycleApi } from "./useSketchLifecycle";
import type { CtxItem, SelectionMode, ViewportRef } from "./types";
import { useWorkPlaneTool } from "./useWorkPlaneTool";

export interface PendingPlaneDelete {
  planeId: string;
  label: string;
  sketches: string[];
}

export function useWorkPlanes(deps: {
  viewportRef: ViewportRef;
  viewportSelectionMode: Ref<SelectionMode>;
  meshes: BodyMeshesApi;
  model: ReturnType<typeof useDocumentModel>;
  history: ModelHistoryApi;
  bodyPresentation: BodyPresentationApi;
  sketchFlow: SketchLifecycleApi;
  leaveActiveTools: () => void;
}) {
  const { viewportRef, meshes, model, history } = deps;
  const documentStore = useDocument();
  const names = useDisplayNames();
  const pendingDelete = ref<PendingPlaneDelete | null>(null);

  const planes = computed<WorkPlaneEntry[]>(() => model.workPlanes.value);

  function meshOf(bodyId: string) {
    return meshes.meshBodies.value.find((body) => body.body_id === bodyId)?.mesh;
  }

  function geometry(components: Record<string, unknown> = documentStore.document.value?.components ?? {}) {
    return meshWorkPlaneGeometry(meshOf, components);
  }

  function components(): Record<string, unknown> {
    return documentStore.document.value?.components ?? {};
  }

  function label(planeId: string): string {
    const plane = planes.value.find((candidate) => candidate.id === planeId);
    return names.names.value[planeId] ?? plane?.label ?? planeId;
  }

  function definitionOf(planeId: string): WorkPlaneDefinition | null {
    return planes.value.find((plane) => plane.id === planeId)?.definition ?? null;
  }

  function created(document: ModelDocument, planeId: string, definition: WorkPlaneDefinition): ModelDocument {
    const frame = computeWorkPlaneFrame(definition, geometry(document.components));
    const component = workPlaneComponent(nextWorkPlaneLabel(document.components), definition, placementOfFrame(frame), document.components);
    return addWorkPlane(document, planeId, component);
  }

  async function create(definition: WorkPlaneDefinition): Promise<string> {
    const planeId = newWorkPlaneId();
    created({ components: components(), timeline: [] }, planeId, definition);
    await history.edit(`Создать ${nextWorkPlaneLabel(components())}`, (document) => created(document, planeId, definition));
    return planeId;
  }

  async function update(planeId: string, definition: WorkPlaneDefinition): Promise<string> {
    const edit = (document: ModelDocument) => {
      const frame = computeWorkPlaneFrame(definition, geometry(document.components));
      return editWorkPlane(document, planeId, definition, editedPlacement(document, planeId, frame));
    };
    edit({ components: components(), timeline: model.timelineEntries.value });
    const change = await history.editTimeline(`Изменить ${label(planeId)}`, edit);
    const failed = [...change.changed, ...change.added].filter(isFailed);
    if (failed.length > 0) toast(`Не построились: ${failed.map(names.entryLabel).join(", ")}.`, "warning");
    return planeId;
  }

  function save(planeId: string | null, definition: WorkPlaneDefinition): Promise<string> {
    return planeId ? update(planeId, definition) : create(definition);
  }

  async function remove(planeId: string) {
    const name = label(planeId);
    try {
      await history.edit(`Удалить ${name}`, (document) => removeWorkPlane(document, planeId));
      toast(`${name} удалена. Отменить — Ctrl+Z`, "success");
    } catch (error) {
      toast(apiErrorMessage(error, "Не удалось удалить плоскость"), "warning");
    }
  }

  function requestRemove(planeId: string): Promise<void> {
    const sketches = sketchesOnPlane(components(), planeId);
    if (sketches.length === 0) return remove(planeId);
    pendingDelete.value = { planeId, label: label(planeId), sketches: sketches.map(names.sketchLabel) };
    return Promise.resolve();
  }

  function confirmRemove(): Promise<void> {
    const pending = pendingDelete.value;
    pendingDelete.value = null;
    return pending ? remove(pending.planeId) : Promise.resolve();
  }

  function cancelRemove() {
    pendingDelete.value = null;
  }

  async function toggleVisibility(planeId: string) {
    const visible = planes.value.find((plane) => plane.id === planeId)?.visible === false;
    await deps.bodyPresentation.setSketchVisible(planeId, visible).catch((error) => toast(apiErrorMessage(error, "Не удалось изменить видимость"), "warning"));
  }

  function startSketch(planeId: string) {
    deps.leaveActiveTools();
    try {
      deps.sketchFlow.startOnWorkPlane(planeId);
    } catch (error) {
      toast(apiErrorMessage(error, "Не удалось начать эскиз на плоскости"), "warning");
    }
  }

  const panel = useWorkPlaneTool({
    viewportRef,
    viewportSelectionMode: deps.viewportSelectionMode,
    meshes,
    model,
    geometry: () => geometry(),
    definitionOf,
    save,
  });

  function edit(planeId: string) {
    deps.leaveActiveTools();
    panel.editPlane(planeId);
  }

  function menuItems(planeId: string, rename: (planeId: string, name: string) => void): CtxItem[] {
    const plane = planes.value.find((candidate) => candidate.id === planeId);
    return [
      { label: "Создать эскиз", action: () => startSketch(planeId) },
      { label: "Изменить параметры", action: () => edit(planeId) },
      { label: plane?.visible !== false ? "Скрыть" : "Показать", action: () => toggleVisibility(planeId) },
      { label: "Переименовать", action: () => rename(planeId, label(planeId)) },
      { label: "Удалить", danger: true, action: () => requestRemove(planeId) },
    ];
  }

  watch(
    [planes, () => meshes.meshBodies.value, viewportRef],
    () => {
      const shown = planes.value.filter((plane) => plane.visible !== false);
      viewportRef.value?.setWorkPlanes(shown.map((plane) => ({ id: plane.id, frame: frameOfPlacement(workPlanePlacement(plane)) })));
    },
    { immediate: true },
  );

  return {
    planes,
    panel,
    tool: panel.tool,
    pendingDelete,
    label,
    create,
    update,
    remove,
    requestRemove,
    confirmRemove,
    cancelRemove,
    toggleVisibility,
    startSketch,
    edit,
    menuItems,
    planeOf: (planeId: string) => workPlaneOf(components(), planeId),
  };
}

function workPlanePlacement(plane: WorkPlaneEntry) {
  return { plane: plane.plane, planeOffset: plane.plane_offset, planeBasis: plane.plane_basis };
}

export type WorkPlanesApi = ReturnType<typeof useWorkPlanes>;
