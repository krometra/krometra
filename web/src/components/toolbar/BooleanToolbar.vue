<script setup lang="ts">
import { computed } from "vue";
import type { BooleanOperation } from "@/types/api";

export interface BodyInfo {
  id: string;
  label?: string;
}

const props = defineProps<{
  availableBodies: BodyInfo[];
  selectedTargetId: string | null;
  selectedToolId: string | null;
  selectedOperation: BooleanOperation;
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  selectTarget: [bodyId: string];
  selectTool: [bodyId: string];
  setOperation: [operation: BooleanOperation];
  apply: [];
  cancel: [];
  clear: [];
}>();

const canApply = computed(
  () => props.selectedTargetId !== null
    && props.selectedToolId !== null
    && !props.loading
);

const targetLabel = computed(() => {
  if (!props.selectedTargetId) return "Click body to select";
  const body = props.availableBodies.find((b) => b.id === props.selectedTargetId);
  return body?.label ?? props.selectedTargetId;
});

const toolLabel = computed(() => {
  if (!props.selectedToolId) return "Click body to select";
  const body = props.availableBodies.find((b) => b.id === props.selectedToolId);
  return body?.label ?? props.selectedToolId;
});

const operations: { value: BooleanOperation; label: string }[] = [
  { value: "union", label: "Union (∪)" },
  { value: "subtract", label: "Subtract (−)" },
  { value: "intersect", label: "Intersect (∩)" },
];
</script>

<template>
  <div :class="$style.toolbar">
    <div :class="$style.head">
      <span :class="$style.title">Boolean Operation</span>
      <button v-if="!loading" :class="$style.closeBtn" @click="emit('cancel')">✕</button>
    </div>

    <div :class="$style.body">
      <!-- Target body -->
      <div :class="$style.field">
        <div :class="$style.fieldLabel">
          <span :class="$style.dotTarget" />
          Target
        </div>
        <div :class="[$style.fieldValue, !selectedTargetId && $style.fieldPlaceholder]">
          {{ targetLabel }}
        </div>
        <select
          v-if="availableBodies.length > 0"
          :class="$style.select"
          :value="selectedTargetId ?? ''"
          @change="emit('selectTarget', ($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>— Pick target —</option>
          <option
            v-for="b in availableBodies"
            :key="b.id"
            :value="b.id"
            :disabled="b.id === selectedToolId"
          >
            {{ b.label ?? b.id }}
          </option>
        </select>
      </div>

      <!-- Tool body -->
      <div :class="$style.field">
        <div :class="$style.fieldLabel">
          <span :class="$style.dotTool" />
          Tool
        </div>
        <div :class="[$style.fieldValue, !selectedToolId && $style.fieldPlaceholder]">
          {{ toolLabel }}
        </div>
        <select
          v-if="availableBodies.length > 0"
          :class="$style.select"
          :value="selectedToolId ?? ''"
          @change="emit('selectTool', ($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>— Pick tool —</option>
          <option
            v-for="b in availableBodies"
            :key="b.id"
            :value="b.id"
            :disabled="b.id === selectedTargetId"
          >
            {{ b.label ?? b.id }}
          </option>
        </select>
      </div>

      <!-- Operation selector -->
      <div :class="$style.field">
        <div :class="$style.fieldLabel">Operation</div>
        <div :class="$style.opButtons">
          <button
            v-for="op in operations"
            :key="op.value"
            :class="[$style.opBtn, selectedOperation === op.value && $style.opBtnActive]"
            @click="emit('setOperation', op.value)"
          >
            {{ op.label }}
          </button>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" :class="$style.error">
        {{ error }}
      </div>

      <!-- Actions -->
      <div :class="$style.actions">
        <button
          :class="$style.applyBtn"
          :disabled="!canApply"
          @click="emit('apply')"
        >
          <span v-if="loading" :class="$style.spinner" />
          {{ loading ? 'Computing…' : 'Apply' }}
        </button>
        <button :class="$style.clearBtn" @click="emit('clear')">
          Clear
        </button>
      </div>
    </div>
  </div>
</template>

<style module>
.toolbar {
  border: 1px solid var(--cs-border);
  border-radius: 10px;
  background: var(--cs-surface-raised);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--cs-border-subtle);
}

.title {
  font-size: 13px;
  font-weight: var(--cs-font-weight-bold);
  color: var(--cs-text);
}

.closeBtn {
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--cs-text-secondary);
  font-size: 14px;
  transition: background var(--cs-transition-fast);
}

.closeBtn:hover {
  background: var(--cs-surface-hover);
}

.body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fieldLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-family: var(--cs-font-mono);
  color: var(--cs-text-secondary);
  text-transform: uppercase;
}

.dotTarget {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: oklch(0.70 0.13 233);
}

.dotTool {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: oklch(0.70 0.14 55);
}

.fieldValue {
  font-family: var(--cs-font-mono);
  font-size: 12px;
  color: var(--cs-text);
  padding: 6px 10px;
  background: var(--cs-surface-sunken);
  border-radius: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fieldPlaceholder {
  color: var(--cs-text-muted);
  font-style: italic;
}

.select {
  width: 100%;
  padding: 6px 8px;
  background: var(--cs-surface-sunken);
  border: 1px solid var(--cs-border);
  border-radius: 6px;
  color: var(--cs-text);
  font-family: var(--cs-font-mono);
  font-size: 12px;
  cursor: pointer;
  outline: none;
}

.select:focus {
  border-color: var(--cs-primary-border);
}

.opButtons {
  display: flex;
  gap: 4px;
}

.opBtn {
  flex: 1;
  cursor: pointer;
  padding: 7px 8px;
  font-size: 12px;
  font-family: var(--cs-font-mono);
  background: var(--cs-surface-sunken);
  border: 1px solid var(--cs-border);
  border-radius: 6px;
  color: var(--cs-text-secondary);
  transition: all var(--cs-transition-fast);
}

.opBtn:hover {
  border-color: var(--cs-primary-border);
  color: var(--cs-text);
}

.opBtnActive {
  background: var(--cs-primary-soft);
  border-color: var(--cs-primary-border);
  color: var(--cs-primary-active);
}

.error {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--cs-red-strong);
  background: oklch(0.96 0.025 25);
  border: 1px solid oklch(0.65 0.16 25 / 0.5);
  border-radius: 6px;
  line-height: 1.5;
}

.actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.applyBtn {
  flex: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px;
  font-size: 13px;
  font-weight: var(--cs-font-weight-bold);
  background: var(--cs-primary);
  color: var(--cs-primary-fg);
  border: none;
  border-radius: 7px;
  transition: background var(--cs-transition-fast), opacity var(--cs-transition-fast);
}

.applyBtn:hover:not(:disabled) {
  background: var(--cs-primary-hover);
}

.applyBtn:disabled {
  background: var(--cs-surface-sunken);
  color: var(--cs-text-disabled);
  cursor: not-allowed;
}

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.clearBtn {
  cursor: pointer;
  padding: 9px 14px;
  font-size: 13px;
  background: transparent;
  border: 1px solid var(--cs-border);
  border-radius: 7px;
  color: var(--cs-text-secondary);
  transition: all var(--cs-transition-fast);
}

.clearBtn:hover {
  border-color: var(--cs-text-muted);
  color: var(--cs-text);
}
</style>
