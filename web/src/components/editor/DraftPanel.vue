<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
const { t } = useI18n();
import { computed } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrCheckbox from "@/components/ui/KrCheckbox.vue";
import KrIcon from "@/components/ui/KrIcon.vue";
import KrInput from "@/components/ui/KrInput.vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { MIRROR_BASE_PLANES } from "@/lib/mirrorPlane";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { DraftApi } from "@/composables/editor/useDraft";

const props = defineProps<{ draft: DraftApi }>();

const names = useDisplayNames();

const usesFace = computed(() => props.draft.neutralSource.value === "face");
const hasFaces = computed(() => props.draft.faceIds.value.length > 0);

const statusText = computed(() => {
  const draft = props.draft;
  if (draft.hint.value) return draft.hint.value;
  if (!draft.bodyId.value) return t("editorPanels.draft_select_faces");
  const faces = t("editorPanels.faces", { count: draft.faceIds.value.length });
  return t("editorPanels.draft_body_faces", { body: names.bodyLabel(draft.bodyId.value), faces });
});

const neutralText = computed(() => {
  if (!usesFace.value) return t("editorPanels.plane_at_origin", { plane: props.draft.basePlane.value });
  if (props.draft.pickingNeutral.value) return t("editorPanels.waiting_face");
  return props.draft.neutralFace.value ? t("editorPanels.planar_face") : t("editorPanels.face_unselected");
});

const BASE_AXES = { XY: "+Z", XZ: "+Y", YZ: "+X" } as const;

const pullText = computed(() => {
  const direction = usesFace.value ? t("editorPanels.draft_into_body") : t("editorPanels.draft_along_axis", { axis: BASE_AXES[props.draft.basePlane.value] });
  return props.draft.reverse.value ? t("editorPanels.draft_expands", { direction }) : t("editorPanels.draft_narrows", { direction });
});
</script>

<template>
  <PropsPanelShell :title="t('editorPanels.draft')" kind="FEATURE" dot-color="oklch(0.72 0.14 140)">
    <div :class="$style.body" data-testid="draft-panel">
      <p :class="[$style.status, hasFaces && $style.statusReady]" data-testid="draft-status">{{ statusText }}</p>

      <div :class="$style.field">
        <span :class="$style.label">{{ t("editorPanels.neutral_plane") }}</span>
        <div :class="$style.row">
          <KrButton
            v-for="plane in MIRROR_BASE_PLANES"
            :key="plane"
            size="sm"
            :variant="!usesFace && draft.basePlane.value === plane ? 'primary' : 'secondary'"
            :data-testid="`draft-neutral-${plane}`"
            @click="draft.selectBasePlane(plane)"
          >
            {{ plane }}
          </KrButton>
          <KrButton
            size="sm"
            :variant="usesFace ? 'primary' : 'secondary'"
            data-testid="draft-neutral-face"
            @click="draft.startNeutralFacePick"
          >
            {{ t("editorPanels.face") }}
          </KrButton>
        </div>
        <span :class="$style.hint" data-testid="draft-neutral-status">{{ neutralText }}</span>
      </div>

      <div :class="$style.field">
        <span :class="$style.label">{{ t("editorPanels.draft_faces") }}</span>
        <ul v-if="hasFaces" :class="$style.list" data-testid="draft-face-list">
          <li v-for="(row, index) in draft.faceRows.value" :key="String(row.faceId)" :class="$style.item" data-testid="draft-face-row">
            <span :class="$style.index">{{ index + 1 }}</span>
            <span :class="$style.itemLabel">{{ row.label }}</span>
            <KrButton
              variant="ghost"
              size="sm"
              :aria-label="t('editorPanels.remove_selection', { name: row.label })"
              data-testid="draft-face-remove"
              @click="draft.removeFace(row.faceId)"
            >
              <KrIcon name="close" :size="12" />
            </KrButton>
          </li>
        </ul>
        <KrCheckbox
          :model-value="draft.tangentChain.value"
          :label="t('editorPanels.tangent_chain')"
          data-testid="draft-tangent-chain"
          @update:model-value="draft.setTangentChain"
        />
      </div>

      <div :class="$style.field">
        <KrInput
          :model-value="draft.angle.text.value"
          :label="t('editorPanels.draft_angle')"
          suffix="°"
          inputmode="decimal"
          :title="t('editorPanels.draft_angle_hint')"
          :error="draft.angle.error.value ?? undefined"
          data-testid="draft-angle"
          @update:model-value="draft.setAngleText"
          @change="draft.angle.commit"
        />
      </div>

      <div :class="$style.field">
        <span :class="$style.label">{{ t("editorPanels.pull_direction") }}</span>
        <div :class="$style.row">
          <KrButton
            size="sm"
            :variant="draft.reverse.value ? 'primary' : 'secondary'"
            data-testid="draft-reverse"
            @click="draft.setReverse(!draft.reverse.value)"
          >
            {{ t("editorPanels.reverse") }}
          </KrButton>
        </div>
        <span :class="$style.hint" data-testid="draft-pull">{{ pullText }}</span>
      </div>

      <p v-if="draft.error.value" :class="$style.error" data-testid="draft-error">{{ draft.error.value }}</p>
    </div>

    <template #foot>
      <KrButton variant="primary" :disabled="!draft.canApply.value" data-testid="draft-apply" @click="draft.apply">
        {{ draft.loading.value ? t("editorPanels.building") : t("editorPanels.apply") }}
      </KrButton>
      <KrButton variant="ghost" :disabled="!hasFaces" data-testid="draft-clear" @click="draft.clear">{{ t("editorPanels.reset_2") }}</KrButton>
      <KrButton variant="ghost" @click="draft.exit">{{ t("editorPanels.close") }}</KrButton>
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

.row {
  display: flex;
  gap: 4px;
}

.hint {
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-muted);
}

.list {
  max-height: 168px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--kr-border);
  border-radius: var(--kr-radius-md);
  background: var(--kr-surface-sunken);
}

.item {
  display: flex;
  align-items: center;
  gap: var(--kr-spacing-sm);
  padding: 0 var(--kr-spacing-xs) 0 var(--kr-spacing-sm);
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-secondary);
}

.item + .item {
  border-top: 1px solid var(--kr-border-subtle);
}

.index {
  flex-shrink: 0;
  min-width: var(--kr-spacing-md);
  font-family: var(--kr-font-mono);
  color: var(--kr-text-muted);
}

.itemLabel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error {
  margin: 0;
  font-size: var(--kr-font-size-xs);
  line-height: 1.45;
  color: var(--kr-danger);
}
</style>
