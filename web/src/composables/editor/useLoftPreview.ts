import { watch, type Ref } from "vue";
import { watchDebounced } from "@vueuse/core";
import type { BrowserLoftOptions } from "./useBrowserGeometry";
import type { ViewportRef } from "./types";

const PREVIEW_DELAY_MS = 250;
const PREVIEW_KEY = "k-loft-preview";

export function useLoftPreview(deps: { viewportRef: ViewportRef; request: Ref<BrowserLoftOptions | null>; busy: Ref<boolean> }) {
  let generation = 0;

  function hide() {
    generation++;
    deps.viewportRef.value?.hideMeshGhost();
  }

  async function refresh() {
    const request = deps.request.value;
    const current = ++generation;
    if (!request || deps.busy.value) {
      deps.viewportRef.value?.hideMeshGhost();
      return;
    }
    try {
      const { buildBrowserLoft, discardBrowserShape } = await import("./useBrowserGeometry");
      const built = await buildBrowserLoft({ ...request, operation: "new_body", targetBodyId: null }, PREVIEW_KEY);
      await discardBrowserShape(built.shapeHandle).catch(() => undefined);
      if (current === generation) deps.viewportRef.value?.showMeshGhost(built.mesh);
    } catch {
      if (current === generation) deps.viewportRef.value?.hideMeshGhost();
    }
  }

  watchDebounced(deps.request, refresh, { debounce: PREVIEW_DELAY_MS, deep: true });
  watch(deps.busy, (busy) => {
    if (busy) hide();
  });

  return { hide };
}
