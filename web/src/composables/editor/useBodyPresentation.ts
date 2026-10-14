import { useDocument } from "@/composables/shared/useDocument";
import type { ViewportRef } from "./types";

export function useBodyPresentation(deps: { projectId: string; viewportRef: ViewportRef }) {
  const documentStore = useDocument();

  async function updateBody(bodyId: string, patch: Record<string, unknown>) {
    const doc = documentStore.document.value;
    const body = doc?.components[bodyId] as Record<string, unknown> | undefined;
    if (!doc || !body) throw new Error(`Тело «${bodyId}» не найдено в документе.`);
    documentStore.document.value = { ...doc, components: { ...doc.components, [bodyId]: { ...body, ...patch } } };
    documentStore.markDirty();
    await documentStore.save(deps.projectId);
    if (documentStore.isDirty.value) throw new Error("Не удалось сохранить документ: он изменён в другой вкладке или сервер недоступен.");
  }

  async function setVisible(bodyId: string, visible: boolean) {
    deps.viewportRef.value?.setMeshVisibility(bodyId, visible);
    await updateBody(bodyId, { visible });
  }

  async function setColor(bodyId: string, color: string | null) {
    deps.viewportRef.value?.setMeshColor(bodyId, color);
    await updateBody(bodyId, { color });
  }

  return { setVisible, setColor };
}

export type BodyPresentationApi = ReturnType<typeof useBodyPresentation>;
