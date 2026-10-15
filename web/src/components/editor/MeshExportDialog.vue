<script setup lang="ts">
import { computed } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsDialog from "@/components/ui/CsDialog.vue";
import CsNumberInput from "@/components/ui/CsNumberInput.vue";
import CsTabs from "@/components/ui/CsTabs.vue";
import type { ExportApi } from "@/composables/editor/useExport";
import { useMeshExportDialog } from "@/composables/editor/useMeshExportDialog";
import { ANGLE_RANGE_DEG, QUALITY_LABELS, TOLERANCE_RANGE, type QualityPreset } from "@/lib/meshQuality";

const props = defineProps<{ exportApi: ExportApi }>();

const dialog = useMeshExportDialog(props.exportApi);
const { target, choice, values } = dialog;

const PRESET_TABS = (Object.keys(QUALITY_LABELS) as QualityPreset[]).map((id) => ({ id, label: QUALITY_LABELS[id] }));

const formatLabel = computed(() => target.value?.format.toUpperCase() ?? "");

const presetValue = computed({
  get: () => dialog.preset.value as string,
  set: (value: string) => {
    dialog.preset.value = value as QualityPreset;
  },
});

const presetSummary = computed(() => `Допуск ${values.value.tolerance} мм, угол ${Math.round(values.value.angleDeg * 10) / 10}°`);

function onOpenChange(open: boolean) {
  if (!open) dialog.close();
}
</script>

<template>
  <CsDialog :open="target !== null" @update:open="onOpenChange">
    <template #title>Экспорт {{ formatLabel }}</template>
    <div v-if="target" :class="$style.body" data-testid="mesh-export-dialog">
      <div :class="$style.scope">{{ exportApi.targetLabel(target.bodyIds) }}</div>
      <div :class="$style.caption">Качество сетки</div>
      <CsTabs v-model="presetValue" :tabs="PRESET_TABS" />
      <div v-if="choice.preset === 'custom'" :class="$style.custom">
        <CsNumberInput
          v-model="choice.custom.tolerance"
          label="Линейный допуск"
          suffix="мм"
          :min="TOLERANCE_RANGE.min"
          :max="TOLERANCE_RANGE.max"
          :step="0.001"
        />
        <CsNumberInput
          v-model="choice.custom.angleDeg"
          label="Угловой допуск"
          suffix="°"
          :min="ANGLE_RANGE_DEG.min"
          :max="ANGLE_RANGE_DEG.max"
          :step="1"
        />
      </div>
      <div v-else :class="$style.hint">{{ presetSummary }}</div>
      <div :class="[$style.estimate, dialog.qualityError.value && $style.error]" data-testid="mesh-export-estimate">
        {{ dialog.estimateText.value }}
      </div>
    </div>
    <template #footer>
      <CsButton variant="secondary" size="md" @click="dialog.close">Отмена</CsButton>
      <CsButton variant="primary" size="md" :disabled="Boolean(dialog.qualityError.value)" @click="dialog.confirm">
        Скачать {{ formatLabel }}
      </CsButton>
    </template>
  </CsDialog>
</template>

<style module>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--cs-spacing-sm);
  min-width: 340px;
}

.scope {
  font-size: var(--cs-font-size-sm);
  color: var(--cs-text);
}

.caption {
  font-size: var(--cs-font-size-sm);
  font-weight: var(--cs-font-weight-medium);
  color: var(--cs-text-secondary);
}

.custom {
  display: flex;
  gap: var(--cs-spacing-sm);
}

.hint,
.estimate {
  font-size: var(--cs-font-size-sm);
  color: var(--cs-text-secondary);
}

.error {
  color: var(--cs-red-strong);
}
</style>
