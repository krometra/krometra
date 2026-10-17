import { computed, shallowRef, type Ref } from "vue";
import type { SketchEntity } from "@/types/api";
import type { DimensionTarget } from "@/sketcher/dimensionPlan";
import { targetOfSelection } from "@/sketcher/dimensionTargets";
import {
  selectedEntityIds,
  toggleSelectionItem,
  uniqueSelection,
  type SketchSelectionItem,
} from "@/sketcher/sketchSelection";

export function useSketchSelection(entities: Ref<SketchEntity[]>) {
  const items = shallowRef<SketchSelectionItem[]>([]);

  const entityIds = computed(() => selectedEntityIds(items.value));
  const count = computed(() => items.value.length);

  function toggle(item: SketchSelectionItem) {
    items.value = toggleSelectionItem(items.value, item);
  }

  function set(next: SketchSelectionItem[]) {
    items.value = uniqueSelection(next);
  }

  function clear() {
    if (items.value.length > 0) items.value = [];
  }

  function targets(): (DimensionTarget | null)[] {
    return items.value.map((item) => targetOfSelection(item, entities.value));
  }

  return { items, entityIds, count, toggle, set, clear, targets };
}

export type SketchSelectionApi = ReturnType<typeof useSketchSelection>;
