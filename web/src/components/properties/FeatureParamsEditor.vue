<script setup lang="ts">
import { toRef } from "vue";
import { useRoute } from "vue-router";
import CsNumberInput from "@/components/ui/CsNumberInput.vue";
import CsSelect from "@/components/ui/CsSelect.vue";
import { useFeatureParams } from "@/composables/editor/useFeatureParams";
import type { MeshData, TimelineEntry } from "@/types/api";

const props = defineProps<{ entry: TimelineEntry | null }>();
const emit = defineEmits<{ rebuilt: [payload: { bodyId: string; mesh: MeshData }] }>();

const route = useRoute();
const params = useFeatureParams({
  projectId: () => String(route.params.id),
  entry: toRef(props, "entry"),
  onMeshUpdated: (bodyId, mesh) => emit("rebuilt", { bodyId, mesh }),
});

function numberValue(key: string): number {
  const value = params.values.value[key];
  return typeof value === "number" ? value : Number(value);
}
</script>

<template>
  <div v-if="params.fields.value.length > 0" :class="$style.fields">
    <template v-for="field in params.fields.value" :key="field.key">
      <CsSelect
        v-if="field.kind === 'select'"
        :model-value="String(params.values.value[field.key])"
        :options="field.options"
        :label="field.label"
        @update:model-value="params.update(field.key, $event)"
      />
      <CsNumberInput
        v-else
        :model-value="numberValue(field.key)"
        :min="field.min"
        :max="field.max"
        :suffix="field.suffix"
        :label="field.label"
        @update:model-value="params.update(field.key, $event)"
      />
    </template>
    <div v-if="params.pending.value" :class="$style.pending">Перестроение модели…</div>
    <div v-else-if="params.error.value" :class="$style.error">{{ params.error.value }}</div>
    <div v-else :class="$style.hint">Изменения пересобирают зависимые операции автоматически</div>
  </div>
</template>

<style module>
.fields {
  display: flex;
  flex-direction: column;
  gap: var(--cs-spacing-sm);
}

.pending {
  font-size: var(--cs-font-size-sm);
  color: var(--cs-amber);
}

.error {
  font-size: var(--cs-font-size-sm);
  color: var(--cs-error);
  line-height: 1.4;
}

.hint {
  font-size: 11px;
  color: var(--cs-text-muted);
}
</style>
