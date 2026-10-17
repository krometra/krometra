import { computed } from "vue";
import { useSketch } from "@/composables/shared/useSketch";
import { historyLockReason, type HistoryLockState } from "@/lib/timelineGuards";

export function useHistoryLock() {
  const sketch = useSketch();
  const state = computed<HistoryLockState>(() => ({ sketchOpen: sketch.sketchMode.value, activeSketchId: sketch.activeSketchId.value }));
  const reason = computed(() => historyLockReason(state.value));
  return { state, reason };
}
