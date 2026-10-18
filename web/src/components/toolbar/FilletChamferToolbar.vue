<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { pluralize } from "@/lib/plural";

type Mode = "fillet" | "chamfer";

const props = defineProps<{
  mode: Mode;
  selectedBodyId: string | null;
  selectedEdgeIds: (string | number)[];
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  applyFillet: [params: { edgeIds: (string | number)[]; radius: number }];
  applyChamfer: [params: { edgeIds: (string | number)[]; distance1: number; distance2: number }];
  previewChange: [params: { mode: "fillet" | "chamfer"; radius: number; distance1: number; distance2: number }];
  cancel: [];
  clear: [];
  "update:mode": [mode: Mode];
}>();

const mode = computed({
  get: () => props.mode,
  set: (value: Mode) => emit("update:mode", value),
});

const filletRadius = ref(5.0);
const chamferDist1 = ref(3.0);
const chamferDist2 = ref(3.0);

watch([mode, filletRadius, chamferDist1, chamferDist2], () => {
  emit("previewChange", {
    mode: mode.value,
    radius: filletRadius.value || 0,
    distance1: chamferDist1.value || 0,
    distance2: chamferDist2.value || 0,
  });
}, { immediate: true });

const canApply = computed(() => {
  if (!props.selectedBodyId) return false;
  if (props.selectedEdgeIds.length === 0) return false;
  if (props.loading) return false;
  if (mode.value === "fillet") return filletRadius.value > 0;
  return chamferDist1.value > 0 && chamferDist2.value > 0;
});

const statusText = computed(() => {
  if (props.selectedEdgeIds.length === 0) {
    return "Кликните ребро или грань тела: грань даёт все свои рёбра. Повторный клик снимает выбор";
  }
  return `Выбрано ${pluralize(props.selectedEdgeIds.length, "ребро", "ребра", "рёбер")}`;
});

function handleApply() {
  if (!canApply.value) return;
  if (mode.value === "fillet") {
    emit("applyFillet", { edgeIds: [...props.selectedEdgeIds], radius: filletRadius.value });
  } else {
    emit("applyChamfer", {
      edgeIds: [...props.selectedEdgeIds],
      distance1: chamferDist1.value,
      distance2: chamferDist2.value,
    });
  }
}
</script>

<template>
  <div :class="$style.toolbar" data-testid="fillet-panel">
    <div :class="$style.head">
      <span :class="$style.title">{{ mode === 'chamfer' ? 'Фаска' : 'Скругление' }}</span>
      <button v-if="!loading" :class="$style.closeBtn" @click="emit('cancel')">✕</button>
    </div>

    <div :class="$style.body">
      <!-- Mode switch -->
      <div :class="$style.modeSwitch">
        <button
          :class="[$style.modeBtn, mode === 'fillet' && $style.modeBtnActive]"
          @click="mode = 'fillet'"
        >
          Скругление
        </button>
        <button
          :class="[$style.modeBtn, mode === 'chamfer' && $style.modeBtnActive]"
          @click="mode = 'chamfer'"
        >
          Фаска
        </button>
      </div>

      <!-- Fillet params -->
      <template v-if="mode === 'fillet'">
        <div :class="$style.field">
          <div :class="$style.fieldLabel">
            <span>Радиус</span>
            <span :class="$style.fieldExpr">мм</span>
          </div>
          <div :class="$style.fieldInput">
            <input
              v-model.number="filletRadius"
              type="number"
              min="0.1"
              step="0.5"
              :class="$style.numberInput"
            />
            <span :class="$style.fieldUnit">мм</span>
          </div>
        </div>
      </template>

      <!-- Chamfer params -->
      <template v-if="mode === 'chamfer'">
        <div :class="$style.field">
          <div :class="$style.fieldLabel">
            <span>Расстояние 1</span>
            <span :class="$style.fieldExpr">мм</span>
          </div>
          <div :class="$style.fieldInput">
            <input
              v-model.number="chamferDist1"
              type="number"
              min="0.1"
              step="0.5"
              :class="$style.numberInput"
            />
            <span :class="$style.fieldUnit">мм</span>
          </div>
        </div>
        <div :class="$style.field">
          <div :class="$style.fieldLabel">
            <span>Расстояние 2</span>
            <span :class="$style.fieldExpr">мм</span>
          </div>
          <div :class="$style.fieldInput">
            <input
              v-model.number="chamferDist2"
              type="number"
              min="0.1"
              step="0.5"
              :class="$style.numberInput"
            />
            <span :class="$style.fieldUnit">мм</span>
          </div>
        </div>
      </template>

      <!-- Selection status -->
      <div :class="[$style.status, selectedEdgeIds.length === 0 && $style.statusPrompt]">
        <span :class="[$style.statusDot, selectedEdgeIds.length > 0 && $style.statusDotActive]" />
        {{ statusText }}
      </div>

      <slot name="selection" />

      <!-- Error -->
      <div v-if="error" data-testid="fillet-error" :class="$style.error">
        {{ error }}
      </div>

      <!-- Actions -->
      <div :class="$style.actions">
        <button
          :class="$style.applyBtn"
          :disabled="!canApply"
          @click="handleApply"
        >
          <span v-if="loading" :class="$style.spinner" />
          {{ loading ? 'Вычисление…' : 'Применить' }}
        </button>
        <button :class="$style.clearBtn" @click="emit('clear')">
          Сброс
        </button>
      </div>
    </div>
  </div>
</template>

<style module>
.toolbar {
  border: 1px solid var(--kr-border);
  border-radius: 10px;
  background: var(--kr-surface-raised);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--kr-border-subtle);
}

.title {
  font-size: 13px;
  font-weight: var(--kr-font-weight-bold);
  color: var(--kr-text);
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
  color: var(--kr-text-secondary);
  font-size: 14px;
  transition: background var(--kr-transition-fast);
}

.closeBtn:hover {
  background: var(--kr-surface-hover);
}

.body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modeSwitch {
  display: flex;
  gap: 4px;
}

.modeBtn {
  flex: 1;
  cursor: pointer;
  padding: 7px 8px;
  font-size: 12px;
  font-family: var(--kr-font-mono);
  background: var(--kr-surface-sunken);
  border: 1px solid var(--kr-border);
  border-radius: 6px;
  color: var(--kr-text-secondary);
  transition: all var(--kr-transition-fast);
}

.modeBtn:hover {
  border-color: var(--kr-primary-border);
  color: var(--kr-text);
}

.modeBtnActive {
  background: var(--kr-primary-soft);
  border-color: var(--kr-primary-border);
  color: var(--kr-primary-active);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fieldLabel {
  font-size: 12px;
  color: var(--kr-text-secondary);
  display: flex;
  justify-content: space-between;
}

.fieldExpr {
  font-family: var(--kr-font-mono);
  color: var(--kr-text-muted);
}

.fieldInput {
  display: flex;
  align-items: center;
  background: var(--kr-surface-sunken);
  border: 1px solid var(--kr-border-strong);
  border-radius: 7px;
  padding: 9px 12px;
  transition: border-color var(--kr-transition-fast);
}

.fieldInput:hover {
  border-color: var(--kr-primary-border);
}

.fieldUnit {
  font-family: var(--kr-font-mono);
  font-size: 12px;
  color: var(--kr-amber-strong);
}

.numberInput {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--kr-font-mono);
  font-size: 14px;
  font-weight: var(--kr-font-weight-medium);
  color: var(--kr-text);
  -moz-appearance: textfield;
}

.numberInput::-webkit-outer-spin-button,
.numberInput::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--kr-font-mono);
  font-size: 11px;
  color: var(--kr-text-secondary);
  padding: 6px 10px;
  background: var(--kr-surface-sunken);
  border-radius: 6px;
}

.statusPrompt {
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  align-items: flex-start;
  color: var(--kr-amber-strong);
}

.statusPrompt .statusDot {
  margin-top: 4px;
}

.statusDot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--kr-text-muted);
}

.statusDotActive {
  background: oklch(0.74 0.13 150);
}

.error {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--kr-red-strong);
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
  font-weight: var(--kr-font-weight-bold);
  background: var(--kr-primary);
  color: var(--kr-primary-fg);
  border: none;
  border-radius: 7px;
  transition: background var(--kr-transition-fast), opacity var(--kr-transition-fast);
}

.applyBtn:hover:not(:disabled) {
  background: var(--kr-primary-hover);
}

.applyBtn:disabled {
  background: var(--kr-surface-sunken);
  color: var(--kr-text-disabled);
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
  border: 1px solid var(--kr-border);
  border-radius: 7px;
  color: var(--kr-text-secondary);
  transition: all var(--kr-transition-fast);
}

.clearBtn:hover {
  border-color: var(--kr-text-muted);
  color: var(--kr-text);
}
</style>
