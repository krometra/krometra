import { watch } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useParameters } from "@/composables/useParameters";

export function useParametersSync() {
  const documentStore = useDocument();
  const paramsStore = useParameters();

  watch(() => documentStore.document.value, (doc) => {
    paramsStore.loadFromDocument(doc);
  }, { immediate: true });

  watch(() => paramsStore.parameters.value, (params) => {
    const doc = documentStore.document.value;
    if (!doc) return;
    if (JSON.stringify(doc.metadata?.parameters ?? []) === JSON.stringify(params)) return;
    documentStore.document.value = {
      ...doc,
      metadata: {
        ...doc.metadata,
        parameters: params,
      },
    };
    documentStore.markDirty();
  }, { deep: true });
}
