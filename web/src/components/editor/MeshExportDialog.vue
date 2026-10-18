<script setup lang="ts">
import { computed } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrDialog from "@/components/ui/KrDialog.vue";
import KrNumberInput from "@/components/ui/KrNumberInput.vue";
import KrTabs from "@/components/ui/KrTabs.vue";
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
  <KrDialog :open="target !== null" @update:open="onOpenChange">
    <template #title>Экспорт {{ formatLabel }}</template>
    <div v-if="target" :class="$style.body" data-testid="mesh-export-dialog">
      <div :class="$style.scope">{{ exportApi.targetLabel(target.bodyIds) }}</div>
      <div :class="$style.caption">Качество сетки</div>
      <KrTabs v-model="presetValue" :tabs="PRESET_TABS" />
      <div v-if="choice.preset === 'custom'" :class="$style.custom">
        <KrNumberInput
          v-model="choice.custom.tolerance"
          label="Линейный допуск"
          suffix="мм"
          :min="TOLERANCE_RANGE.min"
          :max="TOLERANCE_RANGE.max"
          :step="0.001"
        />
        <KrNumberInput
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
      <KrButton variant="secondary" size="md" @click="dialog.close">Отмена</KrButton>
      <KrButton variant="primary" size="md" :disabled="Boolean(dialog.qualityError.value)" @click="dialog.confirm">
        Скачать {{ formatLabel }}
      </KrButton>
    </template>
  </KrDialog>
</template>

<style module>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-sm);
  min-width: 340px;
}

.scope {
  font-size: var(--kr-font-size-sm);
  color: var(--kr-text);
}

.caption {
  font-size: var(--kr-font-size-sm);
  font-weight: var(--kr-font-weight-medium);
  color: var(--kr-text-secondary);
}

.custom {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--kr-spacing-sm);
}

.hint,
.estimate {
  font-size: var(--kr-font-size-sm);
  color: var(--kr-text-secondary);
}

.error {
  color: var(--kr-red-strong);
}
</style>
