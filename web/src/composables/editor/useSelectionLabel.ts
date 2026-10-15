import { computed } from "vue";
import { useSelection } from "@/composables/shared/useSelection";
import { useDisplayNames } from "@/composables/useDisplayNames";

export function useSelectionLabel() {
  const selection = useSelection();
  const names = useDisplayNames();

  return computed(() => {
    const s = selection.selection.value;
    if (!s) return "ничего не выбрано";
    const body = names.bodyLabel(s.bodyId);
    if (s.type === "face") return `выбрано: ${body} / грань #${s.faceId}`;
    if (s.type === "edge") return `выбрано: ${body} / ребро #${s.edgeId}`;
    return `выбрано: ${body} / вершина #${s.vertexId}`;
  });
}
