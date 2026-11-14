<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
const { t } = useI18n();
import { computed } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrCheckbox from "@/components/ui/KrCheckbox.vue";
import KrNumberInput from "@/components/ui/KrNumberInput.vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { MIRROR_BASE_PLANES } from "@/lib/mirrorPlane";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { MirrorApi } from "@/composables/editor/useMirror";

const props = defineProps<{ mirror: MirrorApi }>();

const names = useDisplayNames();

const usesFace = computed(() => props.mirror.planeSource.value === "face");

const statusText = computed(() => {
  const mirror = props.mirror;
  if (mirror.faceHint.value) return mirror.faceHint.value;
  if (!mirror.bodyId.value) {
    return usesFace.value
      ? t("editorPanels.click_a_planar_face_to_mirror_the_body_across")
      : t("editorPanels.click_the_body_to_mirror");
  }
  const body = names.bodyLabel(mirror.bodyId.value);
  if (usesFace.value) return t("editorPanels.mirror_face_status", { body });
  return t("editorPanels.mirror_plane_status", { body, plane: mirror.basePlane.value });
});
</script>

<template>
  <PropsPanelShell :title="t('editorPanels.mirror')" kind="FEATURE" dot-color="oklch(0.72 0.12 200)">
    <div :class="$style.body" data-testid="mirror-panel">
      <p :class="[$style.status, mirror.canApply.value && $style.statusReady]" data-testid="mirror-status">
        {{ statusText }}
      </p>

      <div :class="$style.field">
        <span :class="$style.label">{{ t("editorPanels.plane") }}</span>
        <div :class="$style.planes">
          <KrButton
            v-for="plane in MIRROR_BASE_PLANES"
            :key="plane"
            size="sm"
            :variant="!usesFace && mirror.basePlane.value === plane ? 'primary' : 'secondary'"
            :data-testid="`mirror-plane-${plane}`"
            @click="mirror.selectBasePlane(plane)"
          >
            {{ plane }}
          </KrButton>
          <KrButton
            size="sm"
            :variant="usesFace ? 'primary' : 'secondary'"
            data-testid="mirror-plane-face"
            @click="mirror.selectFacePlane"
          >
            {{ t("editorPanels.face") }}
          </KrButton>
        </div>
      </div>

      <div v-if="!usesFace" :class="$style.field">
        <span :class="$style.label">{{ t("editorPanels.plane_offset") }}</span>
        <KrNumberInput
          :model-value="mirror.offset.value"
          :step="1"
          :suffix="t('editorPanels.mm')"
          data-testid="mirror-offset"
          @update:model-value="mirror.setOffset"
        />
        <span :class="$style.hint">{{ t("editorPanels.along_the_axis_perpendicular_to_the_plane") }}</span>
      </div>

      <KrCheckbox
        :model-value="mirror.merge.value"
        :label="t('editorPanels.merge_with_original_body')"
        data-testid="mirror-merge"
        @update:model-value="mirror.setMerge"
      />
      <span :class="$style.hint">
        {{ mirror.merge.value ? t("editorPanels.the_result_is_one_body_made_from_the_original") : t("editorPanels.the_result_is_a_new_body_the_original_remains") }}
      </span>

      <p v-if="mirror.error.value" :class="$style.error" data-testid="mirror-error">
        {{ mirror.error.value }}
      </p>
    </div>

    <template #foot>
      <KrButton variant="primary" :disabled="!mirror.canApply.value" data-testid="mirror-apply" @click="mirror.apply">
        {{ mirror.loading.value ? t("editorPanels.building") : t("editorPanels.apply") }}
      </KrButton>
      <KrButton variant="ghost" @click="mirror.exit">{{ t("editorPanels.close") }}</KrButton>
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

.status {
  margin: 0;
  font-size: var(--kr-font-size-xs);
  line-height: 1.45;
  color: var(--kr-text-muted);
}

.statusReady {
  color: var(--kr-text-secondary);
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

.hint {
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-muted);
}

.planes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.error {
  margin: 0;
  font-size: var(--kr-font-size-xs);
  line-height: 1.45;
  color: var(--kr-danger);
}
</style>
