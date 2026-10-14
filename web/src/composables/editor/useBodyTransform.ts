import { ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import type { BodyTransform } from "@/lib/bodyTransform";
import type { BodyMeshesApi } from "./useBodyMeshes";

export function useBodyTransform(deps: { projectId: string; meshes: BodyMeshesApi }) {
  const documentStore = useDocument();
  const undoRedo = useUndoRedo();
  const loading = ref(false);

  async function apply(bodyId: string, transform: BodyTransform, copy: boolean): Promise<string> {
    loading.value = true;
    try {
      const { BrowserTransformCommand } = await import("@/core/commands/BrowserTransformCommand");
      const command = new BrowserTransformCommand(deps.projectId, bodyId, transform, copy, () => documentStore.document.value);
      await undoRedo.execute(command);
      const result = command.getResult();
      if (!result) throw new Error("Перемещение не сохранено.");
      result.hiddenBodyIds.forEach((hidden) => deps.meshes.untrackMesh(hidden));
      await documentStore.load(deps.projectId);
      deps.meshes.trackMesh(result.bodyId, result.mesh);
      return result.bodyId;
    } finally {
      loading.value = false;
    }
  }

  return { loading, apply };
}

export type BodyTransformApi = ReturnType<typeof useBodyTransform>;
