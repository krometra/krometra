<script setup lang="ts">
import { computed } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsIcon from "@/components/ui/CsIcon.vue";
import CsInput from "@/components/ui/CsInput.vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { pressPullDirectionHint } from "@/lib/browserPressPull";
import { pluralize } from "@/lib/plural";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { PressPullApi } from "@/composables/editor/usePressPull";

const props = defineProps<{ pressPull: PressPullApi }>();

const names = useDisplayNames();
const field = props.pressPull.distanceField;

const hasFaces = computed(() => props.pressPull.faceIds.value.length > 0);

const statusText = computed(() => {
  const body = props.pressPull.bodyId.value;
  if (!body) return "Кликните грани тела, которые нужно сдвинуть: плоские или цилиндрические. Повторный клик снимает грань.";
  return `${names.bodyLabel(body)}: ${pluralize(props.pressPull.faceIds.value.length, "грань", "грани", "граней")}`;
});

const hint = computed(() => (field.invalid.value ? null : pressPullDirectionHint(field.value.value, props.pressPull.newBody.value)));

function updateDistance(text: string) {
  field.text.value = text;
  field.onInput();
}
</script>

<template>
  <PropsPanelShell title="Сдвиг грани" kind="FEATURE" dot-color="oklch(0.72 0.14 150)">
    <div :class="$style.body" data-testid="press-pull-panel">
      <p :class="[$style.status, hasFaces && $style.statusReady]" data-testid="press-pull-status">{{ statusText }}</p>

      <ul v-if="hasFaces" :class="$style.list" data-testid="press-pull-face-list">
        <li v-for="(row, index) in pressPull.faceRows.value" :key="String(row.faceId)" :class="$style.row" data-testid="press-pull-face-row">
          <span :class="$style.index">{{ index + 1 }}</span>
          <span :class="$style.label">{{ row.label }}</span>
          <CsButton
            variant="ghost"
            size="sm"
            :aria-label="`Снять с выбора: ${row.label}`"
            data-testid="press-pull-face-remove"
            @click="pressPull.removeFace(row.faceId)"
          >
            <CsIcon name="close" :size="12" />
          </CsButton>
        </li>
      </ul>

      <div :class="$style.field" data-testid="press-pull-distance">
        <span :class="$style.fieldLabel">Смещение, мм</span>
        <CsInput
          :model-value="field.text.value"
          :error="field.error.value ?? undefined"
          inputmode="decimal"
          title="Со знаком: плюс наружу по нормали, минус внутрь. Можно выражение с единицами: -0.07, 1/2 in, gap"
          @update:model-value="updateDistance"
          @keydown.enter.prevent="field.commit()"
        />
        <span v-if="hint" :class="$style.hint" data-testid="press-pull-hint">{{ hint }}</span>
      </div>

      <div :class="$style.field">
        <span :class="$style.fieldLabel">Результат</span>
        <div :class="$style.modes">
          <CsButton
            size="sm"
            :variant="pressPull.newBody.value ? 'secondary' : 'primary'"
            data-testid="press-pull-move"
            @click="pressPull.setNewBody(false)"
          >
            Сдвинуть грань
          </CsButton>
          <CsButton
            size="sm"
            :variant="pressPull.newBody.value ? 'primary' : 'secondary'"
            data-testid="press-pull-new-body"
            @click="pressPull.setNewBody(true)"
          >
            Новое тело
          </CsButton>
        </div>
      </div>

      <p v-if="pressPull.error.value" :class="$style.error" data-testid="press-pull-error">{{ pressPull.error.value }}</p>
    </div>

    <template #foot>
      <CsButton
        variant="primary"
        :disabled="!pressPull.canApply.value"
        data-testid="press-pull-apply"
        @click="pressPull.apply"
      >
        {{ pressPull.loading.value ? "Строю…" : "Применить" }}
      </CsButton>
      <CsButton variant="ghost" :disabled="!hasFaces" data-testid="press-pull-clear" @click="pressPull.clear">Сброс</CsButton>
      <CsButton variant="ghost" @click="pressPull.exit">Закрыть</CsButton>
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

.status {
  margin: 0;
  font-size: var(--cs-font-size-xs);
  line-height: 1.45;
  color: var(--cs-text-muted);
}

.statusReady {
  color: var(--cs-text-secondary);
}

.list {
  max-height: 168px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--cs-border);
  border-radius: var(--cs-radius-md);
  background: var(--cs-surface-sunken);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--cs-spacing-sm);
  padding: 0 var(--cs-spacing-xs) 0 var(--cs-spacing-sm);
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
}

.row + .row {
  border-top: 1px solid var(--cs-border-subtle);
}

.index {
  flex-shrink: 0;
  min-width: var(--cs-spacing-md);
  font-family: var(--cs-font-mono);
  color: var(--cs-text-muted);
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
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
}

.modes {
  display: flex;
  gap: 4px;
}

.hint {
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
