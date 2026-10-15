import { ref, watch, type Ref } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { parseQualityChoice, type QualityChoice } from "@/lib/meshQuality";

export const EXPORT_QUALITY_STORAGE_KEY = "krometra.exportQuality";

function readStoredQuality(): QualityChoice {
  try {
    return parseQualityChoice(localStorage.getItem(EXPORT_QUALITY_STORAGE_KEY));
  } catch {
    return parseQualityChoice(null);
  }
}

function storeQuality(choice: QualityChoice): void {
  try {
    localStorage.setItem(EXPORT_QUALITY_STORAGE_KEY, JSON.stringify(choice));
  } catch {
    return;
  }
}

export const useExportQuality = createSharedComposable((): { choice: Ref<QualityChoice> } => {
  const choice = ref<QualityChoice>(readStoredQuality());
  watch(choice, storeQuality, { deep: true });
  return { choice };
});
