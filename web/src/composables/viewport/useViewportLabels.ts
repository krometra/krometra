import { computed, type Ref } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import type { RenderingMode } from "./types";

export function useViewportLabels(mode: Ref<RenderingMode>) {
  const { t } = useI18n();
  const renderingModeLabel = computed(() => ({
    shaded: t("viewportText.shaded"),
    shaded_edges: t("viewportText.shadedEdges"),
    wireframe: t("viewportText.wireframe"),
    hidden_line: t("viewportText.hiddenLine"),
  })[mode.value]);
  return { t, renderingModeLabel };
}
