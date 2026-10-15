<script setup lang="ts">
import { computed } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsCheckbox from "@/components/ui/CsCheckbox.vue";
import CsNumberInput from "@/components/ui/CsNumberInput.vue";
import CsSelect from "@/components/ui/CsSelect.vue";
import PropsPanelShell from "./PropsPanelShell.vue";
import PatternAxisPicker from "./PatternAxisPicker.vue";
import type { PatternApi } from "@/composables/editor/usePattern";
import type { PatternMode, PatternType } from "@/lib/bodyPattern";
import { pickHint, type PatternAxisSlot, type PatternPickKind } from "@/lib/patternForm";

const props = defineProps<{ pattern: PatternApi }>();

const TYPES: { value: PatternType; label: string }[] = [
  { value: "linear", label: "Линейный" },
  { value: "circular", label: "Круговой" },
];

const MODES: { value: PatternMode; label: string }[] = [
  { value: "join", label: "Объединить" },
  { value: "separate", label: "Отдельные тела" },
];

const form = computed(() => props.pattern.form.value);
const circular = computed(() => form.value.type === "circular");

function pickingIn(slot: PatternAxisSlot): PatternPickKind | null {
  const picking = props.pattern.picking.value;
  return picking?.slot === slot ? picking.kind : null;
}

function hintFor(slot: PatternAxisSlot): string {
  return pickHint(pickingIn(slot) ?? "face", slot, form.value.type);
}
</script>

<template>
  <PropsPanelShell title="Массив" kind="FEATURE" dot-color="oklch(0.7 0.13 200)">
    <div :class="$style.body" data-testid="pattern-panel">
      <div :class="$style.row">
        <CsButton
          v-for="option in TYPES"
          :key="option.value"
          size="sm"
          :variant="form.type === option.value ? 'primary' : 'secondary'"
          :data-testid="`pattern-type-${option.value}`"
          @click="pattern.updateForm({ type: option.value })"
        >
          {{ option.label }}
        </CsButton>
      </div>

      <div :class="$style.field">
        <CsSelect
          label="Тело"
          :model-value="pattern.sourceBodyId.value ?? ''"
          :options="pattern.availableBodies.value"
          placeholder="Кликните грань тела"
          data-testid="pattern-source"
          @update:model-value="pattern.setSource"
        />
      </div>

      <PatternAxisPicker
        :label="circular ? 'Ось вращения' : 'Направление'"
        :axis="form.axis"
        :picking="pickingIn('axis')"
        :pick-hint="hintFor('axis')"
        test-id="pattern-axis"
        @global="pattern.setAxis('axis', { kind: $event })"
        @pick="pattern.startPicking('axis', $event)"
        @cancel="pattern.stopPicking"
      />

      <div :class="$style.pair">
        <CsNumberInput
          label="Количество"
          :model-value="form.count"
          :min="2"
          :max="100"
          :step="1"
          data-testid="pattern-count"
          @update:model-value="pattern.updateForm({ count: $event })"
        />
        <CsNumberInput
          v-if="circular"
          label="Полный угол"
          :model-value="form.angle"
          :min="1"
          :max="360"
          :step="15"
          suffix="°"
          data-testid="pattern-angle"
          @update:model-value="pattern.updateForm({ angle: $event })"
        />
        <CsNumberInput
          v-else
          label="Шаг"
          :model-value="form.spacing"
          :step="1"
          suffix="мм"
          data-testid="pattern-spacing"
          @update:model-value="pattern.updateForm({ spacing: $event })"
        />
      </div>
      <span v-if="circular" :class="$style.hint">360° — копии по всей окружности, меньше — крайние встают на концы дуги</span>
      <span v-else :class="$style.hint">Отрицательный шаг разворачивает направление</span>

      <template v-if="!circular">
        <CsCheckbox
          :model-value="form.secondDirection"
          label="Второе направление (сетка)"
          data-testid="pattern-second"
          @update:model-value="pattern.updateForm({ secondDirection: $event })"
        />
        <template v-if="form.secondDirection">
          <PatternAxisPicker
            label="Направление 2"
            :axis="form.axis2"
            :picking="pickingIn('axis2')"
            :pick-hint="hintFor('axis2')"
            test-id="pattern-axis2"
            @global="pattern.setAxis('axis2', { kind: $event })"
            @pick="pattern.startPicking('axis2', $event)"
            @cancel="pattern.stopPicking"
          />
          <div :class="$style.pair">
            <CsNumberInput
              label="Количество 2"
              :model-value="form.count2"
              :min="1"
              :max="100"
              :step="1"
              data-testid="pattern-count2"
              @update:model-value="pattern.updateForm({ count2: $event })"
            />
            <CsNumberInput
              label="Шаг 2"
              :model-value="form.spacing2"
              :step="1"
              suffix="мм"
              data-testid="pattern-spacing2"
              @update:model-value="pattern.updateForm({ spacing2: $event })"
            />
          </div>
        </template>
      </template>

      <div :class="$style.field">
        <span :class="$style.label">Результат</span>
        <div :class="$style.row">
          <CsButton
            v-for="option in MODES"
            :key="option.value"
            size="sm"
            :variant="pattern.mode.value === option.value ? 'primary' : 'secondary'"
            :data-testid="`pattern-mode-${option.value}`"
            @click="pattern.setMode(option.value)"
          >
            {{ option.label }}
          </CsButton>
        </div>
        <span :class="$style.hint">Объединённый массив тела-инструмента вырезается из детали одной булевой операцией</span>
      </div>

      <p v-if="pattern.error.value || pattern.formError.value" :class="$style.error" data-testid="pattern-error">
        {{ pattern.error.value ?? pattern.formError.value }}
      </p>
    </div>

    <template #foot>
      <CsButton
        variant="primary"
        :disabled="pattern.formError.value !== null || pattern.loading.value"
        data-testid="pattern-apply"
        @click="pattern.apply"
      >
        {{ pattern.loading.value ? "Строю…" : "Применить" }}
      </CsButton>
      <CsButton variant="ghost" @click="pattern.exit">Закрыть</CsButton>
    </template>
  </PropsPanelShell>
</template>

<style module>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--cs-spacing-md);
  padding: var(--cs-spacing-md);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--cs-spacing-sm);
}

.hint {
  margin-top: calc(var(--cs-spacing-sm) * -1);
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-muted);
}

.error {
  margin: 0;
  font-size: var(--cs-font-size-xs);
  line-height: 1.45;
  color: var(--cs-danger);
}
</style>
