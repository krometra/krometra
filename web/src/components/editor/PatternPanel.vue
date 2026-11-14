<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
const { t } = useI18n();
import { computed } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrCheckbox from "@/components/ui/KrCheckbox.vue";
import KrNumberInput from "@/components/ui/KrNumberInput.vue";
import KrSelect from "@/components/ui/KrSelect.vue";
import PropsPanelShell from "./PropsPanelShell.vue";
import PatternAxisPicker from "./PatternAxisPicker.vue";
import type { PatternApi } from "@/composables/editor/usePattern";
import type { PatternMode, PatternType } from "@/lib/bodyPattern";
import { pickHint, type PatternAxisSlot, type PatternPickKind } from "@/lib/patternForm";

const props = defineProps<{ pattern: PatternApi }>();

const TYPES = computed<{ value: PatternType; label: string }[]>(() => [
  { value: "linear", label: t("editorPanels.linear") },
  { value: "circular", label: t("editorPanels.circular") },
]);

const MODES = computed<{ value: PatternMode; label: string }[]>(() => [
  { value: "join", label: t("editorPanels.union") },
  { value: "separate", label: t("editorPanels.separate") },
]);

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
  <PropsPanelShell :title="t('editorPanels.pattern')" kind="FEATURE" dot-color="oklch(0.7 0.13 200)">
    <div :class="$style.body" data-testid="pattern-panel">
      <div :class="$style.row">
        <KrButton
          v-for="option in TYPES"
          :key="option.value"
          size="sm"
          :variant="form.type === option.value ? 'primary' : 'secondary'"
          :data-testid="`pattern-type-${option.value}`"
          @click="pattern.updateForm({ type: option.value })"
        >
          {{ option.label }}
        </KrButton>
      </div>

      <div :class="$style.field">
        <KrSelect
          :label="t('editorPanels.body')"
          :model-value="pattern.sourceBodyId.value ?? ''"
          :options="pattern.availableBodies.value"
          :placeholder="t('editorPanels.click_face')"
          data-testid="pattern-source"
          @update:model-value="pattern.setSource"
        />
      </div>

      <PatternAxisPicker
        :label="circular ? t('editorPanels.axis') : t('editorPanels.direction')"
        :axis="form.axis"
        :picking="pickingIn('axis')"
        :pick-hint="hintFor('axis')"
        test-id="pattern-axis"
        @global="pattern.setAxis('axis', { kind: $event })"
        @pick="pattern.startPicking('axis', $event)"
        @cancel="pattern.stopPicking"
      />

      <div :class="$style.pair">
        <KrNumberInput
          :label="t('editorPanels.quantity')"
          :model-value="form.count"
          :min="2"
          :max="100"
          :step="1"
          data-testid="pattern-count"
          @update:model-value="pattern.updateForm({ count: $event })"
        />
        <KrNumberInput
          v-if="circular"
          :label="t('editorPanels.full_angle')"
          :model-value="form.angle"
          :min="1"
          :max="360"
          :step="15"
          suffix="°"
          data-testid="pattern-angle"
          @update:model-value="pattern.updateForm({ angle: $event })"
        />
        <KrNumberInput
          v-else
          :label="t('editorPanels.pitch')"
          :model-value="form.spacing"
          :step="1"
          :suffix="t('editorPanels.mm')"
          data-testid="pattern-spacing"
          @update:model-value="pattern.updateForm({ spacing: $event })"
        />
      </div>
      <span v-if="circular" :class="$style.hint">{{ t("editorPanels.pattern_circle_hint") }}</span>
      <span v-else :class="$style.hint">{{ t("editorPanels.negative_pitch") }}</span>

      <template v-if="!circular">
        <KrCheckbox
          :model-value="form.secondDirection"
          :label="t('editorPanels.second_direction')"
          data-testid="pattern-second"
          @update:model-value="pattern.updateForm({ secondDirection: $event })"
        />
        <template v-if="form.secondDirection">
          <PatternAxisPicker
            :label="t('editorPanels.direction2')"
            :axis="form.axis2"
            :picking="pickingIn('axis2')"
            :pick-hint="hintFor('axis2')"
            test-id="pattern-axis2"
            @global="pattern.setAxis('axis2', { kind: $event })"
            @pick="pattern.startPicking('axis2', $event)"
            @cancel="pattern.stopPicking"
          />
          <div :class="$style.pair">
            <KrNumberInput
              :label="t('editorPanels.count2')"
              :model-value="form.count2"
              :min="1"
              :max="100"
              :step="1"
              data-testid="pattern-count2"
              @update:model-value="pattern.updateForm({ count2: $event })"
            />
            <KrNumberInput
              :label="t('editorPanels.spacing2')"
              :model-value="form.spacing2"
              :step="1"
              :suffix="t('editorPanels.mm')"
              data-testid="pattern-spacing2"
              @update:model-value="pattern.updateForm({ spacing2: $event })"
            />
          </div>
        </template>
      </template>

      <div :class="$style.field">
        <span :class="$style.label">{{ t("editorPanels.result") }}</span>
        <div :class="$style.row">
          <KrButton
            v-for="option in MODES"
            :key="option.value"
            size="sm"
            :variant="pattern.mode.value === option.value ? 'primary' : 'secondary'"
            :data-testid="`pattern-mode-${option.value}`"
            @click="pattern.setMode(option.value)"
          >
            {{ option.label }}
          </KrButton>
        </div>
        <span :class="$style.hint">{{ t("editorPanels.pattern_cut_hint") }}</span>
      </div>

      <p v-if="pattern.error.value || pattern.formError.value" :class="$style.error" data-testid="pattern-error">
        {{ pattern.error.value ?? pattern.formError.value }}
      </p>
    </div>

    <template #foot>
      <KrButton
        variant="primary"
        :disabled="pattern.formError.value !== null || pattern.loading.value"
        data-testid="pattern-apply"
        @click="pattern.apply"
      >
        {{ pattern.loading.value ? t("editorPanels.building") : t("editorPanels.apply") }}
      </KrButton>
      <KrButton variant="ghost" @click="pattern.exit">{{ t("editorPanels.close") }}</KrButton>
    </template>
  </PropsPanelShell>
</template>

<style module>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-md);
  padding: var(--kr-spacing-md);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-secondary);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--kr-spacing-sm);
}

.hint {
  margin-top: calc(var(--kr-spacing-sm) * -1);
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-muted);
}

.error {
  margin: 0;
  font-size: var(--kr-font-size-xs);
  line-height: 1.45;
  color: var(--kr-danger);
}
</style>
