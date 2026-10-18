<script setup lang="ts">
import { computed } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrIcon from "@/components/ui/KrIcon.vue";
import KrSelect from "@/components/ui/KrSelect.vue";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { BrowserExtrudeOperation } from "@/lib/browserBoolean";
import type { LoftTransition } from "@/lib/browserLoftSetup";
import type { LoftApi } from "@/composables/editor/useLoft";

const props = defineProps<{ loft: LoftApi }>();
const { profiles, operation, targetBodyId, transition, loading, error, setupError, addOptions, targetOptions } = props.loft;

const OPERATIONS = [
  { value: "new_body", label: "Новое тело" },
  { value: "join", label: "Приклеить" },
  { value: "cut", label: "Вырезать" },
];

const TRANSITIONS = [
  { value: "smooth", label: "Гладкий" },
  { value: "ruled", label: "Линейный" },
];

const message = computed(() => error.value ?? setupError.value);
const applyLabel = computed(() => {
  if (loading.value) return "Лофт…";
  return operation.value === "cut" ? "Вырезать лофтом" : "Построить лофт";
});
</script>

<template>
  <PropsPanelShell title="Лофт" kind="LOFT" dot-color="oklch(0.72 0.12 200)">
    <div :class="$style.body" data-testid="loft-panel">
      <div :class="$style.section">
        <span :class="$style.caption">Профили по порядку</span>
        <ol v-if="profiles.length > 0" :class="$style.list" data-testid="loft-profiles">
          <li v-for="(profile, index) in profiles" :key="profile.id" :class="$style.row" data-testid="loft-profile-row">
            <span :class="$style.index">{{ index + 1 }}</span>
            <span :class="$style.label">{{ profile.label }}</span>
            <KrButton
              variant="ghost"
              size="sm"
              :disabled="index === 0"
              :aria-label="`Выше: ${profile.label}`"
              data-testid="loft-profile-up"
              @click="loft.moveProfile(index, -1)"
            >
              <KrIcon name="arrowUp" :size="12" />
            </KrButton>
            <KrButton
              variant="ghost"
              size="sm"
              :disabled="index === profiles.length - 1"
              :aria-label="`Ниже: ${profile.label}`"
              data-testid="loft-profile-down"
              @click="loft.moveProfile(index, 1)"
            >
              <KrIcon name="arrowDown" :size="12" />
            </KrButton>
            <KrButton
              variant="ghost"
              size="sm"
              :aria-label="`Убрать из лофта: ${profile.label}`"
              data-testid="loft-profile-remove"
              @click="loft.removeProfile(index)"
            >
              <KrIcon name="close" :size="12" />
            </KrButton>
          </li>
        </ol>
        <KrSelect
          v-if="addOptions.length > 0"
          model-value=""
          :options="addOptions"
          placeholder="Добавить эскиз-профиль"
          data-testid="loft-add-profile"
          @update:model-value="$event && loft.addProfile($event)"
        />
      </div>
      <KrSelect
        :model-value="operation"
        :options="OPERATIONS"
        label="Операция"
        data-testid="loft-operation"
        @update:model-value="loft.setOperation($event as BrowserExtrudeOperation)"
      />
      <KrSelect
        v-if="operation !== 'new_body'"
        :model-value="targetBodyId ?? ''"
        :options="targetOptions"
        label="Целевое тело"
        data-testid="loft-target"
        @update:model-value="targetBodyId = $event || null"
      />
      <KrSelect
        :model-value="transition"
        :options="TRANSITIONS"
        label="Переход"
        data-testid="loft-transition"
        @update:model-value="transition = $event as LoftTransition"
      />
      <p :class="$style.hint">
        Профиль - один замкнутый контур эскиза. Кликните эскиз в дереве или на ленте истории, чтобы добавить его. Гладкий переход плавно огибает промежуточные профили, линейный соединяет соседние прямыми.
      </p>
      <p v-if="message" :class="$style.error" data-testid="loft-error">{{ message }}</p>
      <KrButton
        variant="primary"
        :disabled="loading || setupError !== null"
        :loading="loading"
        data-testid="loft-apply"
        @click="loft.apply"
      >
        {{ applyLabel }}
      </KrButton>
    </div>
    <template #foot>
      <KrButton variant="ghost" size="sm" :class="$style.cancelBtn" @click="loft.exit">Отмена (Esc)</KrButton>
    </template>
  </PropsPanelShell>
</template>

<style module>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-md);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-sm);
}

.caption {
  font-size: var(--kr-font-size-sm);
  color: var(--kr-text-secondary);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--kr-border);
  border-radius: var(--kr-radius-md);
  background: var(--kr-surface-sunken);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--kr-spacing-xs);
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
