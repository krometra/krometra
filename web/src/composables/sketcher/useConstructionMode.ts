import { computed, ref, type Ref } from "vue";
import type { SketchEntity } from "@/types/api";
import { asConstruction, toggledConstructionFlag } from "@/sketcher/construction";

export function useConstructionMode(deps: {
  entities: Ref<SketchEntity[]>;
  selectedEntityIds: Readonly<Ref<string[]>>;
  toggleSelected: () => void;
  onModeChange: () => void;
}) {
  const enabled = ref(false);

  const selectionAction = computed(() => {
    const flag = toggledConstructionFlag(deps.entities.value, deps.selectedEntityIds.value);
    if (flag === null) return null;
    return flag ? "Сделать вспомогательной" : "Сделать обычной";
  });

  function toggle() {
    enabled.value = !enabled.value;
    deps.onModeChange();
  }

  function toggleSelectionOrMode() {
    if (selectionAction.value) deps.toggleSelected();
    else toggle();
  }

  function reset() {
    enabled.value = false;
  }

  function mark<T extends SketchEntity>(entity: T): T {
    return enabled.value ? asConstruction(entity) : entity;
  }

  return { enabled, selectionAction, toggle, toggleSelectionOrMode, reset, mark };
}

export type ConstructionModeApi = ReturnType<typeof useConstructionMode>;
