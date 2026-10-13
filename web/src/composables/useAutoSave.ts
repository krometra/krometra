// Auto-save composable: periodically saves when document is dirty

import { watch, onUnmounted } from "vue";
import { useDocument } from "./shared/useDocument";

export function useAutoSave(projectId: string, intervalMs: number = 30000) {
  const doc = useDocument();
  let timer: ReturnType<typeof setInterval> | null = null;

  // Start periodic save
  function start() {
    if (timer) return;
    timer = setInterval(() => {
      if (doc.isDirty.value && !doc.conflict.value) {
        doc.save(projectId);
      }
    }, intervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  // Watch for dirty changes to trigger save
  watch(
    () => doc.isDirty.value,
    (dirty) => {
      if (dirty && !doc.conflict.value) {
        start();
      }
    }
  );

  onUnmounted(() => {
    stop();
  });

  return { start, stop };
}
