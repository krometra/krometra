<script setup lang="ts">
import { computed } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsIcon from "@/components/ui/CsIcon.vue";
import CsNumberInput from "@/components/ui/CsNumberInput.vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { pluralize } from "@/lib/plural";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { ShellApi } from "@/composables/editor/useShell";

const props = defineProps<{ shell: ShellApi }>();

const names = useDisplayNames();

const hasFaces = computed(() => props.shell.faceIds.value.length > 0);

const statusText = computed(() => {
  const body = props.shell.bodyId.value;
  if (!body) return "Кликните грани, которые оболочка откроет: например, верх корпуса. Повторный клик снимает грань.";
  return `${names.bodyLabel(body)}: ${pluralize(props.shell.faceIds.value.length, "открытая грань", "открытые грани", "открытых граней")}`;
});
</script>

<template>
  <PropsPanelShell title="Оболочка" kind="FEATURE" dot-color="oklch(0.74 0.15 55)">
    <div :class="$style.body" data-testid="shell-panel">
      <p :class="[$style.status, hasFaces && $style.statusReady]" data-testid="shell-status">{{ statusText }}</p>

      <ul v-if="hasFaces" :class="$style.list" data-testid="shell-face-list">
        <li v-for="(row, index) in shell.faceRows.value" :key="String(row.faceId)" :class="$style.row" data-testid="shell-face-row">
          <span :class="$style.index">{{ index + 1 }}</span>
          <span :class="$style.label">{{ row.label }}</span>
          <CsButton
            variant="ghost"
            size="sm"
            :aria-label="`Снять с выбора: ${row.label}`"
            data-testid="shell-face-remove"
            @click="shell.removeFace(row.faceId)"
          >
            <CsIcon name="close" :size="12" />
          </CsButton>
        </li>
      </ul>

      <div :class="$style.field">
        <span :class="$style.fieldLabel">Толщина стенки</span>
        <CsNumberInput
          :model-value="shell.thickness.value"
          :min="0.01"
          :step="0.5"
          suffix="мм"
          data-testid="shell-thickness"
          @update:model-value="shell.setThickness"
        />
      </div>

      <div :class="$style.field">
        <span :class="$style.fieldLabel">Направление</span>
        <div :class="$style.directions">
          <CsButton
            size="sm"
            :variant="shell.direction.value === 'inward' ? 'primary' : 'secondary'"
            data-testid="shell-inward"
            @click="shell.setDirection('inward')"
          >
            Внутрь
          </CsButton>
          <CsButton
            size="sm"
            :variant="shell.direction.value === 'outward' ? 'primary' : 'secondary'"
            data-testid="shell-outward"
            @click="shell.setDirection('outward')"
          >
            Наружу
          </CsButton>
        </div>
        <span :class="$style.hint">
          {{ shell.direction.value === "inward" ? "Габарит тела сохраняется, стенка растёт внутрь" : "Тело становится полостью, стенка растёт наружу" }}
        </span>
      </div>

      <p v-if="shell.error.value" :class="$style.error" data-testid="shell-error">{{ shell.error.value }}</p>
    </div>

    <template #foot>
      <CsButton
        variant="primary"
        :disabled="!hasFaces || shell.loading.value"
        data-testid="shell-apply"
        @click="shell.apply"
      >
        {{ shell.loading.value ? "Строю…" : "Применить" }}
      </CsButton>
      <CsButton variant="ghost" :disabled="!hasFaces" data-testid="shell-clear" @click="shell.clear">Сброс</CsButton>
      <CsButton variant="ghost" @click="shell.exit">Закрыть</CsButton>
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

.directions {
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
