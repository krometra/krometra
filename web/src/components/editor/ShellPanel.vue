<script setup lang="ts">
import { computed } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrIcon from "@/components/ui/KrIcon.vue";
import KrNumberInput from "@/components/ui/KrNumberInput.vue";
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
          <KrButton
            variant="ghost"
            size="sm"
            :aria-label="`Снять с выбора: ${row.label}`"
            data-testid="shell-face-remove"
            @click="shell.removeFace(row.faceId)"
          >
            <KrIcon name="close" :size="12" />
          </KrButton>
        </li>
      </ul>

      <div :class="$style.field">
        <span :class="$style.fieldLabel">Толщина стенки</span>
        <KrNumberInput
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
          <KrButton
            size="sm"
            :variant="shell.direction.value === 'inward' ? 'primary' : 'secondary'"
            data-testid="shell-inward"
            @click="shell.setDirection('inward')"
          >
            Внутрь
          </KrButton>
          <KrButton
            size="sm"
            :variant="shell.direction.value === 'outward' ? 'primary' : 'secondary'"
            data-testid="shell-outward"
            @click="shell.setDirection('outward')"
          >
            Наружу
          </KrButton>
        </div>
        <span :class="$style.hint">
          {{ shell.direction.value === "inward" ? "Габарит тела сохраняется, стенка растёт внутрь" : "Тело становится полостью, стенка растёт наружу" }}
        </span>
      </div>

      <p v-if="shell.error.value" :class="$style.error" data-testid="shell-error">{{ shell.error.value }}</p>
    </div>

    <template #foot>
      <KrButton
        variant="primary"
        :disabled="!hasFaces || shell.loading.value"
        data-testid="shell-apply"
        @click="shell.apply"
      >
        {{ shell.loading.value ? "Строю…" : "Применить" }}
      </KrButton>
      <KrButton variant="ghost" :disabled="!hasFaces" data-testid="shell-clear" @click="shell.clear">Сброс</KrButton>
      <KrButton variant="ghost" @click="shell.exit">Закрыть</KrButton>
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

.directions {
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
