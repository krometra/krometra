import { computed, getCurrentScope, onScopeDispose, shallowReactive } from "vue";
import { createSharedComposable } from "@vueuse/core";

type SketchIdsReader = () => (string | null | undefined)[];

export const useOperationSketches = createSharedComposable(() => {
  const readers = shallowReactive(new Map<string, SketchIdsReader>());

  const ids = computed(() => new Set(
    [...readers.values()].flatMap((read) => read()).filter((id): id is string => typeof id === "string" && id !== ""),
  ));

  function track(owner: string, read: SketchIdsReader) {
    readers.set(owner, read);
    if (getCurrentScope()) onScopeDispose(() => readers.delete(owner));
  }

  return { ids, track };
});
