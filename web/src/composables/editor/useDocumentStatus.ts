import { computed, ref, watch } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import { useDocument } from "@/composables/shared/useDocument";

export type DocStatus = "loading" | "saved" | "saving" | "unsaved" | "conflict";

export function useDocumentStatus(projectId: string) {
  const documentStore = useDocument();
  const { t } = useI18n();

  const docStatus = ref<DocStatus>("loading");
  const docVersion = computed(() => documentStore.version.value);
  const statusLabel = computed(() => {
    switch (docStatus.value) {
      case "loading": return t("editor.status.loading");
      case "saving": return t("editor.status.saving");
      case "unsaved": return t("editor.status.unsaved");
      case "conflict": return t("editor.status.conflict");
      default: return t("editor.status.saved");
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
