<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
const { t } = useI18n();
import { computed } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrSelect from "@/components/ui/KrSelect.vue";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { BrowserExtrudeOperation } from "@/lib/browserBoolean";
import type { BrowserSweepOrientation } from "@/lib/browserSweepPath";
import type { SweepApi } from "@/composables/editor/useSweep";

const props = defineProps<{ sweep: SweepApi }>();
const { profileSketchId, pathSketchId, operation, targetBodyId, orientation, loading, error, setupError, sketchOptions, targetOptions } = props.sweep;

const OPERATIONS = computed(() => [
  { value: "new_body", label: t("editorPanels.new_body") },
  { value: "join", label: t("editorPanels.join") },
  { value: "cut", label: t("editorPanels.cut") },
]);

const ORIENTATIONS = computed(() => [
  { value: "corrected", label: t("editorPanels.no_twist") },
  { value: "frenet", label: t("editorPanels.frenet") },
]);

const message = computed(() => error.value ?? setupError.value);
const applyLabel = computed(() => {
  if (loading.value) return t("editorPanels.sweeping");
  return operation.value === "cut" ? t("editorPanels.cut_along_path") : t("editorPanels.sweep_along_path");
});
</script>

<template>
  <PropsPanelShell :title="t('editorPanels.sweep')" kind="SWEEP" dot-color="oklch(0.70 0.13 180)">
    <div :class="$style.body" data-testid="sweep-panel">
      <KrSelect
        :model-value="profileSketchId ?? ''"
        :options="sketchOptions"
        :label="t('editorPanels.profile')"
        :placeholder="t('editorPanels.sketch_with_a_closed_contour')"
        data-testid="sweep-profile"
        @update:model-value="profileSketchId = $event || null"
      />
      <KrSelect
        :model-value="pathSketchId ?? ''"
        :options="sketchOptions"
        :label="t('editorPanels.path')"
        :placeholder="t('editorPanels.sketch_with_segments_and_arcs')"
        data-testid="sweep-path"
        @update:model-value="pathSketchId = $event || null"
      />
      <KrSelect
        :model-value="operation"
        :options="OPERATIONS"
        :label="t('editorPanels.operation')"
        data-testid="sweep-operation"
        @update:model-value="sweep.setOperation($event as BrowserExtrudeOperation)"
      />
      <KrSelect
        v-if="operation !== 'new_body'"
        :model-value="targetBodyId ?? ''"
        :options="targetOptions"
        :label="t('editorPanels.target_body')"
        data-testid="sweep-target"
        @update:model-value="targetBodyId = $event || null"
      />
      <KrSelect
        :model-value="orientation"
        :options="ORIENTATIONS"
        :label="t('editorPanels.profile_orientation')"
        data-testid="sweep-orientation"
        @update:model-value="orientation = $event as BrowserSweepOrientation"
      />
      <p :class="$style.hint">
        {{ t("editorPanels.the_path_starts_on_the_profile_and_leaves_its") }}
      </p>
      <p v-if="message" :class="$style.error" data-testid="sweep-error">{{ message }}</p>
      <KrButton
        variant="primary"
        :disabled="loading || setupError !== null"
        :loading="loading"
        data-testid="sweep-apply"
        @click="sweep.apply"
      >
        {{ applyLabel }}
      </KrButton>
    </div>
    <template #foot>
      <KrButton variant="ghost" size="sm" :class="$style.cancelBtn" @click="sweep.exit">{{ t("editorPanels.cancel_esc") }}</KrButton>
    </template>
  </PropsPanelShell>
</template>

<style module>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-md);
}

.hint {
  margin: 0;
  font-size: var(--kr-font-size-sm);
  color: var(--kr-text-muted);
  line-height: 1.45;
}

.error {
  margin: 0;
  font-size: var(--kr-font-size-sm);
  color: var(--kr-error);
  line-height: 1.45;
}

.cancelBtn.cancelBtn {
  flex: 1;
  height: auto;
  border: 1px solid var(--kr-border-strong);
  font-size: 13px;
  padding: 9px;
  border-radius: 7px;
  color: var(--kr-text-secondary);
}

.cancelBtn.cancelBtn:hover {
  background: transparent;
  border-color: var(--kr-text-muted);
  color: var(--kr-text);
}
</style>
