<script setup lang="ts">
// Панель ограничений: появляется при выделении объектов эскиза.
import type { ConstraintType } from "@/types/api";

defineProps<{
  selectedCount: number;
  constraintTypes: ConstraintType[];
  canApply: (type: ConstraintType) => boolean;
  label: (type: ConstraintType) => string;
  title: (type: ConstraintType) => string;
}>();

const emit = defineEmits<{
  (e: "apply", type: ConstraintType): void;
  (e: "clear"): void;
}>();
</script>

<template>
  <div :class="$style.constraintToolbar" data-sketch-ui>
    <span :class="$style.constraintCtx">Выбрано: {{ selectedCount }}</span>
    <button
      v-for="ct in constraintTypes"
      :key="ct"
      :class="[$style.constraintBtn, canApply(ct) && $style.constraintBtnActive]"
      :disabled="!canApply(ct)"
      :title="title(ct)"
      @click="emit('apply', ct)"
    >
      {{ label(ct) }}
    </button>
    <button :class="$style.constraintClearBtn" @click="emit('clear')">✕</button>
  </div>
</template>

<style module>
.constraintToolbar {
  min-height: 36px;
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  box-sizing: border-box;
  background: oklch(0.22 0.02 75 / 0.15);
  border-bottom: 1px solid oklch(0.78 0.13 75 / 0.2);
}

.constraintCtx {
  font-size: 11px;
  color: var(--cs-amber-strong);
  margin-right: 6px;
  font-family: var(--cs-font-mono, monospace);
}

.constraintBtn {
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border: 1px solid var(--cs-border-strong);
  border-radius: 5px;
  background: transparent;
  color: var(--cs-text-disabled);
  cursor: pointer;
  font-family: var(--cs-font-mono, monospace);
  font-size: 12px;
  transition: all 0.12s;
}

.constraintBtn:hover:not(:disabled) {
  border-color: oklch(0.78 0.13 75 / 0.4);
}

.constraintBtnActive {
  color: var(--cs-amber-strong);
  border-color: oklch(0.78 0.13 75 / 0.4);
}

.constraintBtnActive:hover:not(:disabled) {
  background: oklch(0.78 0.13 75 / 0.1);
}

.constraintBtn:disabled {
  color: var(--cs-text-disabled);
  border-color: var(--cs-border-subtle);
  cursor: not-allowed;
}

.constraintClearBtn {
  height: 26px;
  width: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--cs-border-strong);
  border-radius: 5px;
  background: transparent;
  color: var(--cs-text-secondary);
  cursor: pointer;
  font-size: 13px;
  margin-left: 4px;
}

.constraintClearBtn:hover {
  background: var(--cs-surface-hover);
  color: var(--cs-text);
}
</style>
