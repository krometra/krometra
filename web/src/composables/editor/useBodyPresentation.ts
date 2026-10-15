import { useDocument } from "@/composables/shared/useDocument";
import type { ViewportRef } from "./types";

export function useBodyPresentation(deps: { projectId: string; viewportRef: ViewportRef }) {
  const documentStore = useDocument();

  async function updateComponent(componentId: string, patch: Record<string, unknown>) {
    const doc = documentStore.document.value;
    const component = doc?.components[componentId] as Record<string, unknown> | undefined;
    if (!doc || !component) throw new Error(`«${componentId}» не найден в документе.`);
    documentStore.document.value = { ...doc, components: { ...doc.components, [componentId]: { ...component, ...patch } } };
    documentStore.markDirty();
    await documentStore.save(deps.projectId);
    if (documentStore.isDirty.value) throw new Error("Не удалось сохранить документ: он изменён в другой вкладке или сервер недоступен.");
  }

  async function setVisible(bodyId: string, visible: boolean) {
    deps.viewportRef.value?.setMeshVisibility(bodyId, visible);
    await updateComponent(bodyId, { visible });
  }

  async function setSketchVisible(sketchId: string, visible: boolean) {
    await updateComponent(sketchId, { visible });
  }

  async function setColor(bodyId: string, color: string | null) {
    deps.viewportRef.value?.setMeshColor(bodyId, color);
    await updateComponent(bodyId, { color });
  }

  return { setVisible, setSketchVisible, setColor };
}

export type BodyPresentationApi = ReturnType<typeof useBodyPresentation>;
