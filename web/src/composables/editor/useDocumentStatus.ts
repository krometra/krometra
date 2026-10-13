import { computed, ref, watch } from "vue";
import { useDocument } from "@/composables/shared/useDocument";

export type DocStatus = "loading" | "saved" | "saving" | "unsaved" | "conflict";

export function useDocumentStatus(projectId: string) {
  const documentStore = useDocument();

  const docStatus = ref<DocStatus>("loading");
  const docVersion = computed(() => documentStore.version.value);
  const statusLabel = computed(() => {
    switch (docStatus.value) {
      case "loading": return "загрузка…";
      case "saving": return "сохранение…";
      case "unsaved": return "есть изменения";
      case "conflict": return "конфликт";
      default: return "сохранено";
    }
  });

  watch(() => documentStore.conflict.value, (c) => {
    if (c) docStatus.value = "conflict";
  });
  watch(() => documentStore.isLoading.value, (loading) => {
    if (loading && docStatus.value !== "loading") docStatus.value = "saving";
    else if (!loading && docStatus.value === "saving") {
      docStatus.value = documentStore.conflict.value ? "conflict" : "saved";
    }
  });
  watch(() => documentStore.isDirty.value, (dirty) => {
    if (dirty && docStatus.value === "saved") docStatus.value = "unsaved";
  });

  function handleReload() {
    documentStore.load(projectId).then(() => {
      docStatus.value = "saved";
    });
  }

  return { docStatus, docVersion, statusLabel, handleReload };
}
