import { onMounted, onUnmounted } from "vue";
import { useApi } from "@/composables/useApi";
import { isSavedNaming, type SavedNaming } from "@/lib/browserNaming";
import { createBrowserShapeHydrator, type StoredBrowserBody } from "./browserShapeHydration";

export function useBrowserShapeHydration(projectId: string) {
  const api = useApi();
  let stopListening: (() => void) | null = null;
  let unmounted = false;

  async function loadStep(bodyId: string): Promise<ArrayBuffer> {
    const { blob } = await api.blob(`/projects/${projectId}/geometry/${bodyId}/browser-step`);
    return blob.arrayBuffer();
  }

  async function loadNaming(bodyId: string): Promise<SavedNaming | null> {
    try {
      const naming = await api.get<unknown>(`/projects/${projectId}/geometry/${bodyId}/browser-naming`);
      return isSavedNaming(naming) ? naming : null;
    } catch (error) {
      if ((error as { error?: string }).error === "browser_naming_not_found") return null;
      throw error;
    }
  }

  async function loadBody(bodyId: string): Promise<StoredBrowserBody> {
    const [step, naming] = await Promise.all([loadStep(bodyId), loadNaming(bodyId)]);
    return { step, naming };
  }

  async function hydrateShape(bodyId: string, stored: StoredBrowserBody) {
    const { hydrateBrowserShape } = await import("./useBrowserGeometry");
    return hydrateBrowserShape(bodyId, stored.step, stored.naming);
  }

  async function restoreBodies(bodyIds: string[]) {
    await Promise.all(bodyIds.map(async (bodyId) => hydrateShape(bodyId, await loadBody(bodyId))));
  }

  const hydrator = createBrowserShapeHydrator({
    loadBody: (body) => loadBody(body.id),
    hydrateShape,
  });

  onMounted(async () => {
    const kernel = await import("./useBrowserGeometry");
    if (unmounted) return;
    stopListening = kernel.onBrowserKernelRestart(restoreBodies);
    void kernel.warmUpBrowserKernel();
  });

  onUnmounted(() => {
    unmounted = true;
    stopListening?.();
    import("./useBrowserGeometry").then(({ disposeBrowserGeometry }) => disposeBrowserGeometry());
  });

  return hydrator;
}
