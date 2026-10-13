// Shared undo/redo composable — wraps CommandHistory for the editor

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

  async function execute(cmd: Command): Promise<void> {
    if (isExecuting.value) return;
    isExecuting.value = true;
    try {
      await history.execute(cmd);
    } finally {
      isExecuting.value = false;
      historyVersion.value++;
    }
  }

  async function undo(): Promise<void> {
    if (isExecuting.value || !canUndo.value) return;
    isExecuting.value = true;
    try {
      await history.undo();
    } finally {
      isExecuting.value = false;
      historyVersion.value++;
    }
  }

  async function redo(): Promise<void> {
    if (isExecuting.value || !canRedo.value) return;
    isExecuting.value = true;
    try {
      await history.redo();
    } finally {
      isExecuting.value = false;
      historyVersion.value++;
    }
  }

  return { execute, undo, redo, canUndo, canRedo, isExecuting };
});
