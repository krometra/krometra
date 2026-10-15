<script setup lang="ts">
import { computed } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsSelect from "@/components/ui/CsSelect.vue";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { BrowserExtrudeOperation } from "@/lib/browserBoolean";
import type { BrowserSweepOrientation } from "@/lib/browserSweepPath";
import type { SweepApi } from "@/composables/editor/useSweep";

const props = defineProps<{ sweep: SweepApi }>();
const { profileSketchId, pathSketchId, operation, targetBodyId, orientation, loading, error, setupError, sketchOptions, targetOptions } = props.sweep;

const OPERATIONS = [
  { value: "new_body", label: "Новое тело" },
  { value: "join", label: "Приклеить" },
  { value: "cut", label: "Вырезать" },
];

const ORIENTATIONS = [
  { value: "corrected", label: "Без закрутки" },
  { value: "frenet", label: "По Френе" },
];

const message = computed(() => error.value ?? setupError.value);
const applyLabel = computed(() => {
  if (loading.value) return "Протяжка…";
  return operation.value === "cut" ? "Вырезать по траектории" : "Протянуть по траектории";
});
</script>

<template>
  <PropsPanelShell title="По траектории" kind="SWEEP" dot-color="oklch(0.70 0.13 180)">
    <div :class="$style.body" data-testid="sweep-panel">
      <CsSelect
        :model-value="profileSketchId ?? ''"
        :options="sketchOptions"
        label="Профиль"
        placeholder="Эскиз с замкнутым контуром"
        data-testid="sweep-profile"
        @update:model-value="profileSketchId = $event || null"
      />
      <CsSelect
        :model-value="pathSketchId ?? ''"
        :options="sketchOptions"
        label="Путь"
        placeholder="Эскиз с отрезками и дугами"
        data-testid="sweep-path"
        @update:model-value="pathSketchId = $event || null"
      />
      <CsSelect
        :model-value="operation"
        :options="OPERATIONS"
        label="Операция"
        data-testid="sweep-operation"
        @update:model-value="sweep.setOperation($event as BrowserExtrudeOperation)"
      />
      <CsSelect
        v-if="operation !== 'new_body'"
        :model-value="targetBodyId ?? ''"
        :options="targetOptions"
        label="Целевое тело"
        data-testid="sweep-target"
        @update:model-value="targetBodyId = $event || null"
      />
      <CsSelect
        :model-value="orientation"
        :options="ORIENTATIONS"
        label="Ориентация профиля"
        data-testid="sweep-orientation"
        @update:model-value="orientation = $event as BrowserSweepOrientation"
      />
      <p :class="$style.hint">
        Путь начинается на профиле и уходит из его плоскости. «Без закрутки» держит профиль ровно вдоль всего пути.
      </p>
      <p v-if="message" :class="$style.error" data-testid="sweep-error">{{ message }}</p>
      <CsButton
        variant="primary"
        :disabled="loading || setupError !== null"
        :loading="loading"
        data-testid="sweep-apply"
        @click="sweep.apply"
      >
        {{ applyLabel }}
      </CsButton>
    </div>
    <template #foot>
      <CsButton variant="ghost" size="sm" :class="$style.cancelBtn" @click="sweep.exit">Отмена (Esc)</CsButton>
    </template>
  </PropsPanelShell>
</template>

<style module>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--cs-spacing-md);
}

.hint {
  margin: 0;
  font-size: var(--cs-font-size-sm);
  color: var(--cs-text-muted);
  line-height: 1.45;
}

.error {
  margin: 0;
  font-size: var(--cs-font-size-sm);
  color: var(--cs-error);
  line-height: 1.45;
}

.cancelBtn.cancelBtn {
  flex: 1;
  height: auto;
  border: 1px solid var(--cs-border-strong);
  font-size: 13px;
  padding: 9px;
  border-radius: 7px;
  color: var(--cs-text-secondary);
}

.cancelBtn.cancelBtn:hover {
  background: transparent;
  border-color: var(--cs-text-muted);
  color: var(--cs-text);
}
</style>
