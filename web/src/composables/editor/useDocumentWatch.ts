import { onUnmounted, ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useApi } from "@/composables/useApi";
import type { BodyMeshesApi } from "./useBodyMeshes";

const POLL_MS = 1500;

export function useDocumentWatch(deps: { projectId: string; meshes: BodyMeshesApi }) {
  const documentStore = useDocument();
  const api = useApi();
  const lastSyncedAt = ref<Date | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  let polling = false;

  async function poll() {
    if (polling || documentStore.isLoading.value || deps.meshes.hydrating.value) return;
    polling = true;
    try {
      const { version } = await api.get<{ version: number }>(`/projects/${deps.projectId}/document/version`);
      if (version !== documentStore.version.value) {
        await documentStore.load(deps.projectId);
        await deps.meshes.reloadBodyMeshes();
      }
      lastSyncedAt.value = new Date();
    } finally {
      polling = false;
    }
  }

  function start() {
    if (!timer) timer = setInterval(() => void poll().catch(() => undefined), POLL_MS);
  }

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return { start, lastSyncedAt };
}
