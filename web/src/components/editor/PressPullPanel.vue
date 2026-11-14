<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
const { t } = useI18n();
import { computed } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrIcon from "@/components/ui/KrIcon.vue";
import KrInput from "@/components/ui/KrInput.vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { pressPullDirectionHint } from "@/lib/browserPressPull";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { PressPullApi } from "@/composables/editor/usePressPull";

const props = defineProps<{ pressPull: PressPullApi }>();

const names = useDisplayNames();
const field = props.pressPull.distanceField;

const hasFaces = computed(() => props.pressPull.faceIds.value.length > 0);

const statusText = computed(() => {
  const body = props.pressPull.bodyId.value;
  if (!body) return t("editorPanels.offset_faces_select");
  return `${names.bodyLabel(body)}: ${t("editorPanels.faces", { count: props.pressPull.faceIds.value.length })}`;
});

const hint = computed(() => (field.invalid.value ? null : pressPullDirectionHint(field.value.value, props.pressPull.newBody.value)));

function updateDistance(text: string) {
  field.text.value = text;
  field.onInput();
}
</script>

<template>
  <PropsPanelShell :title="t('editorPanels.offset_face')" kind="FEATURE" dot-color="oklch(0.72 0.14 150)">
    <div :class="$style.body" data-testid="press-pull-panel">
      <p :class="[$style.status, hasFaces && $style.statusReady]" data-testid="press-pull-status">{{ statusText }}</p>

      <ul v-if="hasFaces" :class="$style.list" data-testid="press-pull-face-list">
        <li v-for="(row, index) in pressPull.faceRows.value" :key="String(row.faceId)" :class="$style.row" data-testid="press-pull-face-row">
          <span :class="$style.index">{{ index + 1 }}</span>
          <span :class="$style.label">{{ row.label }}</span>
          <KrButton
            variant="ghost"
            size="sm"
            :aria-label="t('editorPanels.remove_selection', { name: row.label })"
            data-testid="press-pull-face-remove"
            @click="pressPull.removeFace(row.faceId)"
          >
            <KrIcon name="close" :size="12" />
          </KrButton>
        </li>
      </ul>

      <div :class="$style.field" data-testid="press-pull-distance">
        <span :class="$style.fieldLabel">{{ t("editorPanels.offset_mm") }}</span>
        <KrInput
          :model-value="field.text.value"
          :error="field.error.value ?? undefined"
          inputmode="decimal"
          :title="t('editorPanels.offset_hint')"
          @update:model-value="updateDistance"
          @keydown.enter.prevent="field.commit()"
        />
        <span v-if="hint" :class="$style.hint" data-testid="press-pull-hint">{{ hint }}</span>
      </div>

      <div :class="$style.field">
        <span :class="$style.fieldLabel">{{ t("editorPanels.result") }}</span>
        <div :class="$style.modes">
          <KrButton
            size="sm"
            :variant="pressPull.newBody.value ? 'secondary' : 'primary'"
            data-testid="press-pull-move"
            @click="pressPull.setNewBody(false)"
          >
            {{ t("editorPanels.move_face") }}
          </KrButton>
          <KrButton
            size="sm"
            :variant="pressPull.newBody.value ? 'primary' : 'secondary'"
            data-testid="press-pull-new-body"
            @click="pressPull.setNewBody(true)"
          >
            {{ t("editorPanels.new_body") }}
          </KrButton>
        </div>
      </div>

      <p v-if="pressPull.error.value" :class="$style.error" data-testid="press-pull-error">{{ pressPull.error.value }}</p>
    </div>

    <template #foot>
      <KrButton
        variant="primary"
        :disabled="!pressPull.canApply.value"
        data-testid="press-pull-apply"
        @click="pressPull.apply"
      >
        {{ pressPull.loading.value ? t("editorPanels.building") : t("editorPanels.apply") }}
      </KrButton>
      <KrButton variant="ghost" :disabled="!hasFaces" data-testid="press-pull-clear" @click="pressPull.clear">{{ t("editorPanels.reset_2") }}</KrButton>
      <KrButton variant="ghost" @click="pressPull.exit">{{ t("editorPanels.close") }}</KrButton>
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

.row {
  display: flex;
  align-items: center;
  gap: var(--kr-spacing-sm);
  padding: 0 var(--kr-spacing-xs) 0 var(--kr-spacing-sm);
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-secondary);
}

.row + .row {
  border-top: 1px solid var(--kr-border-subtle);
}

.index {
  flex-shrink: 0;
  min-width: var(--kr-spacing-md);
  font-family: var(--kr-font-mono);
  color: var(--kr-text-muted);
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fieldLabel {
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-secondary);
}

.modes {
  display: flex;
  gap: 4px;
}

.hint {
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
