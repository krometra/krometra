import { useI18n } from "@/composables/shared/useI18n";
import { computed } from "vue";
import { useSelection } from "@/composables/shared/useSelection";
import { useDisplayNames } from "@/composables/useDisplayNames";

export function useSelectionLabel() {
  const { t: tr } = useI18n();
  const selection = useSelection();
  const names = useDisplayNames();

  return computed(() => {
    const s = selection.selection.value;
    if (!s) return tr("editorOps.selectionNone");
    const body = names.bodyLabel(s.bodyId);
    if (s.type === "face") return tr("editorOps.selectedFace", { body, id: s.faceId });
    if (s.type === "edge") return tr("editorOps.selectedEdge", { body, id: s.edgeId });
    return tr("editorOps.selectedVertex", { body, id: s.vertexId });
  });
}
