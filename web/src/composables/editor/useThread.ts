import { ref, type Ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useSelection } from "@/composables/shared/useSelection";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import type { ThreadParams } from "@/core/commands/BrowserThreadCommand";
import type { BrepTopo, ThreadCylinderResponse } from "@/types/api";
import type { ThreadCylinder, ThreadPreviewParams } from "@/composables/viewport/usePreviews";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { BrowserThreadFace } from "./browserThread";
import { isBrowserBody } from "./browserShapeHydration";
import type { SelectionMode, ViewportRef } from "./types";

/**
 * Режим нарезки резьбы: пользователь выбирает цилиндрическую грань, задаёт шаг.
 *
 * Внешняя резьба (болт) или внутренняя (гайка) не выбирается вручную: сторону
 * определяет ориентация грани на сервере — стенка отверстия развёрнута к оси,
 * боковая поверхность стержня от неё. Так пользователь не может ошибиться
 * типом и получить резьбу, растущую не в ту сторону.
 */
export function useThread(deps: {
  projectId: string;
  viewportRef: ViewportRef;
  viewportSelectionMode: Ref<SelectionMode>;
  meshes: BodyMeshesApi;
}) {
  const { projectId, viewportRef, viewportSelectionMode, meshes } = deps;
  const documentStore = useDocument();
  const selection = useSelection();
  const undoRedo = useUndoRedo();

  const threadMode = ref(false);
  const bodyId = ref<string | null>(null);
  const faceId = ref<string | number | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** Геометрия выбранной грани: по ней рисуется призрак резьбы. */
  const cylinder = ref<ThreadCylinder | null>(null);
  /** Почему на грани резьбы не будет (грань не цилиндрическая). */
  const faceHint = ref<string | null>(null);
  let previewParams: ThreadPreviewParams | null = null;
  let browserFace: BrowserThreadFace | null = null;

  function refreshPreview() {
    const viewport = viewportRef.value;
    if (!viewport) return;
    if (!threadMode.value || !cylinder.value || !previewParams) {
      viewport.hideThreadPreview();
      return;
    }
    viewport.showThreadPreview(cylinder.value, previewParams);
  }

  /** Панель отдаёт параметры на каждое изменение — призрак перестраивается сразу. */
  function updatePreview(params: ThreadPreviewParams) {
    previewParams = params;
    refreshPreview();
  }

  function clearCylinder() {
    cylinder.value = null;
    faceHint.value = null;
    viewportRef.value?.hideThreadPreview();
  }

  function isBrowserBodyId(body: string) {
    const component = documentStore.document.value?.components?.[body];
    return isBrowserBody({ id: body, ...(component as object | undefined) });
  }

  async function fetchBrowserCylinder(body: string, face: string | number): Promise<ThreadCylinderResponse> {
    const mesh = meshes.meshBodies.value.find((entry) => entry.body_id === body)?.mesh;
    if (!mesh) return { cylindrical: false, reason: "Геометрия тела ещё не загружена." };
    const { browserThreadFace, describeBrowserThreadCylinder } = await import("./browserThread");
    browserFace = browserThreadFace(mesh, body, face);
    const info = await describeBrowserThreadCylinder(browserFace);
    return info.cylindrical ? { cylindrical: true, ...info.cylinder } : { cylindrical: false, reason: info.reason };
  }

  function fetchCylinder(body: string, face: string | number): Promise<ThreadCylinderResponse> {
    browserFace = null;
    if (isBrowserBodyId(body)) return fetchBrowserCylinder(body, face);
    return Promise.resolve({ cylindrical: false, reason: "Тело не загружено в браузерное ядро." });
  }

  async function createCommand(body: string, face: string | number, params: ThreadParams) {
    const getDoc = () => documentStore.document.value;
    if (!browserFace || browserFace.bodyId !== body || browserFace.faceId !== face) {
      throw new Error("Грань ещё не разобрана браузерным ядром — выберите её заново.");
    }
    const { BrowserThreadCommand } = await import("@/core/commands/BrowserThreadCommand");
    return new BrowserThreadCommand(projectId, browserFace, params, getDoc);
  }

  async function loadCylinder(body: string, face: string | number) {
    const info = await fetchCylinder(body, face);
    // Пока грузили — пользователь мог выбрать другую грань или выйти из режима.
    if (!threadMode.value || bodyId.value !== body || faceId.value !== face) return;

    if (!info.cylindrical) {
      clearCylinder();
      faceHint.value = info.reason ?? "На этой грани резьба не строится.";
      return;
    }
    cylinder.value = {
      radius: info.radius ?? 0,
      origin: info.origin ?? [0, 0, 0],
      direction: info.direction ?? [0, 0, 1],
      start: info.start ?? 0,
      length: info.length ?? 0,
      external: info.external ?? true,
    };
    faceHint.value = null;
    refreshPreview();
  }

  function enter() {
    threadMode.value = true;
    bodyId.value = null;
    faceId.value = null;
    error.value = null;
    clearCylinder();
    viewportSelectionMode.value = "face";
    viewportRef.value?.clearHighlight();
  }

  function exit() {
    threadMode.value = false;
    bodyId.value = null;
    faceId.value = null;
    error.value = null;
    clearCylinder();
    viewportRef.value?.clearHighlight();
    viewportSelectionMode.value = "face";
  }

  function clear() {
    bodyId.value = null;
    faceId.value = null;
    error.value = null;
    clearCylinder();
    viewportRef.value?.clearHighlight();
    selection.clearSelection();
  }

  function onFaceSelected(payload: { bodyId: string; faceId: string | number; brepTopo: BrepTopo }) {
    if (!threadMode.value) return;
    bodyId.value = payload.bodyId;
    faceId.value = payload.faceId;
    error.value = null;
    selection.selectFace(payload.bodyId, payload.faceId, payload.brepTopo);
    clearCylinder();
    loadCylinder(payload.bodyId, payload.faceId).catch((err: unknown) => {
      const apiError = err as { error_description?: string };
      faceHint.value = apiError?.error_description ?? "Не удалось разобрать грань.";
    });
  }

  function onSelectionCleared() {
    if (!threadMode.value) return;
    bodyId.value = null;
    faceId.value = null;
    clearCylinder();
  }

  async function apply(params: ThreadParams) {
    if (!bodyId.value || faceId.value === null) return;
    const sourceBodyId = bodyId.value;

    loading.value = true;
    error.value = null;
    try {
      const command = await createCommand(sourceBodyId, faceId.value, params);
      await undoRedo.execute(command);

      const result = command.getResult();
      if (result) meshes.replaceMesh(result.bodyId, result.mesh);
      if (result && result.bodyId !== sourceBodyId) viewportRef.value?.setMeshVisibility(sourceBodyId, false);

      documentStore.markDirty();
      await documentStore.load(projectId);
      exit();
    } catch (err: unknown) {
      // Бэкенд объясняет отказ по-русски («грань не цилиндрическая»,
      // «длина больше грани») — показываем это, а не общую фразу.
      const apiError = err as { error_description?: string };
      error.value =
        apiError?.error_description ??
        (err instanceof Error ? err.message : "Ошибка построения резьбы");
      console.error("Ошибка резьбы:", err);
    } finally {
      loading.value = false;
    }
  }

  return {
    threadMode,
    bodyId,
    faceId,
    cylinder,
    faceHint,
    loading,
    error,
    enter,
    exit,
    clear,
    onFaceSelected,
    onSelectionCleared,
    updatePreview,
    apply,
  };
}

export type ThreadApi = ReturnType<typeof useThread>;
export type { ThreadParams };
