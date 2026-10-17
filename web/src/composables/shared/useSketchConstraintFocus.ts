import { readonly, ref } from "vue";
import { createSharedComposable } from "@vueuse/core";

export const useSketchConstraintFocus = createSharedComposable(() => {
  const selectedId = ref<string | null>(null);
  const hoveredId = ref<string | null>(null);

  function select(id: string | null) {
    selectedId.value = id;
  }

  function hover(id: string | null) {
    hoveredId.value = id;
  }

  function forget(existingIds: Set<string>) {
    if (selectedId.value !== null && !existingIds.has(selectedId.value)) selectedId.value = null;
    if (hoveredId.value !== null && !existingIds.has(hoveredId.value)) hoveredId.value = null;
  }

  function clear() {
    selectedId.value = null;
    hoveredId.value = null;
  }

  return {
    selectedId: readonly(selectedId),
    hoveredId: readonly(hoveredId),
    select,
    hover,
    forget,
    clear,
  };
});
