import { ref, computed } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { CommandHistory } from "@/core/commands/CommandHistory";
import type { Command } from "@/core/commands/Command";

export const useUndoRedo = createSharedComposable(() => {
  const history = new CommandHistory();
  const isExecuting = ref(false);
  // CommandHistory не реактивен — версия форсит пересчёт canUndo/canRedo
  const historyVersion = ref(0);

  const canUndo = computed(() => {
    void historyVersion.value;
    return history.canUndo;
  });
  const canRedo = computed(() => {
    void historyVersion.value;
    return history.canRedo;
  });

  async function run<T>(step: () => Promise<T>): Promise<T> {
    if (isExecuting.value) throw new Error("Идёт другая операция истории: повторите позже.");
    isExecuting.value = true;
    try {
      return await step();
    } finally {
      isExecuting.value = false;
      historyVersion.value++;
    }
  }

  function execute(cmd: Command): Promise<void> {
    return run(() => history.execute(cmd));
  }

  function undo(): Promise<Command | null> {
    return run(() => history.undo());
  }

  function redo(): Promise<Command | null> {
    return run(() => history.redo());
  }

  return { execute, undo, redo, canUndo, canRedo, isExecuting };
});
