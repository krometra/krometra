<script setup lang="ts">
import { computed } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrCheckbox from "@/components/ui/KrCheckbox.vue";
import KrSelect from "@/components/ui/KrSelect.vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import type { BooleanModeApi } from "@/composables/editor/useBooleanMode";
import type { BooleanOperation } from "@/types/api";
import BodyPickList from "./BodyPickList.vue";
import PropsPanelShell from "./PropsPanelShell.vue";

const props = defineProps<{ boolean: BooleanModeApi }>();

const names = useDisplayNames();

const OPERATIONS: { value: BooleanOperation; label: string }[] = [
  { value: "union", label: "Объединить" },
  { value: "subtract", label: "Вычесть" },
  { value: "intersect", label: "Пересечь" },
];

const targetOptions = computed(() => props.boolean.availableBodies.value.map((body) => ({ value: body.id, label: body.label })));

const toolOptions = computed(() =>
  targetOptions.value.filter((option) => option.value !== props.boolean.targetId.value && !props.boolean.toolIds.value.includes(option.value)),
);

const canApply = computed(() => props.boolean.targetId.value !== null && props.boolean.toolIds.value.length > 0 && !props.boolean.loading.value);

const statusText = computed(() => {
  const target = props.boolean.targetId.value;
  if (!target) return "Кликните целевое тело в сцене или в дереве";
  if (props.boolean.toolIds.value.length === 0) return `${names.bodyLabel(target)}: кликните одно или несколько тел-инструментов`;
  return "Клик по выбранному телу снимает его с выбора";
});

function addTool(bodyId: string) {
  if (bodyId) props.boolean.selectTool(bodyId);
}
</script>

<template>
  <PropsPanelShell title="Комбинировать" kind="CSG" dot-color="oklch(0.65 0.14 300)">
    <div :class="$style.body" data-testid="boolean-panel">
      <p :class="$style.status" data-testid="boolean-status">{{ statusText }}</p>

      <div :class="$style.field">
        <span :class="$style.label">Операция</span>
        <div :class="$style.operations">
          <KrButton
            v-for="op in OPERATIONS"
            :key="op.value"
            size="sm"
            :variant="boolean.operation.value === op.value ? 'primary' : 'secondary'"
            :data-testid="`boolean-op-${op.value}`"
            @click="boolean.setOperation(op.value)"
          >
            {{ op.label }}
          </KrButton>
        </div>
      </div>

      <KrSelect
        :model-value="boolean.targetId.value ?? ''"
        :options="targetOptions"
        label="Целевое тело"
        placeholder="Кликните тело"
        data-testid="boolean-target"
        @update:model-value="$event && boolean.selectTarget($event)"
      />

      <div :class="$style.field">
        <span :class="$style.label">Тела-инструменты · {{ boolean.toolIds.value.length }}</span>
        <BodyPickList
          :body-ids="boolean.toolIds.value"
          empty="Кликните тела-инструменты в сцене или в дереве"
          test-id="boolean-tools"
          @remove="boolean.removeTool"
        />
        <KrSelect
          v-if="toolOptions.length > 0"
          :key="boolean.toolIds.value.join()"
          model-value=""
          :options="toolOptions"
          placeholder="Добавить инструмент"
          data-testid="boolean-add-tool"
          @update:model-value="addTool"
        />
      </div>

      <KrCheckbox
        :model-value="boolean.keepTools.value"
        label="Сохранить инструменты"
        data-testid="boolean-keep-tools"
        @update:model-value="boolean.setKeepTools"
      />
      <span :class="$style.hint">
        {{ boolean.keepTools.value ? "Инструменты останутся отдельными видимыми телами" : "Инструменты будут поглощены результатом" }}
      </span>

      <p v-if="boolean.error.value" :class="$style.error" data-testid="boolean-error">{{ boolean.error.value }}</p>
    </div>

    <template #foot>
      <KrButton variant="primary" :disabled="!canApply" data-testid="boolean-apply" @click="boolean.apply">
        {{ boolean.loading.value ? "Строю…" : "Применить" }}
      </KrButton>
      <KrButton variant="ghost" data-testid="boolean-clear" @click="boolean.clear">Сбросить</KrButton>
      <KrButton variant="ghost" @click="boolean.exit">Закрыть</KrButton>
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

.operations {
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
  color: var(--kr-red-strong);
}
</style>
