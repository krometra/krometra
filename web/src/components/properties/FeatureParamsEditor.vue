<script setup lang="ts">
import { toRef } from "vue";
import { useRoute } from "vue-router";
import KrNumberInput from "@/components/ui/KrNumberInput.vue";
import KrSelect from "@/components/ui/KrSelect.vue";
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
      <KrSelect
        v-if="field.kind === 'select'"
        :model-value="String(params.values.value[field.key])"
        :options="field.options"
        :label="field.label"
        @update:model-value="params.update(field.key, $event)"
      />
      <KrNumberInput
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
  gap: var(--kr-spacing-sm);
}

.pending {
  font-size: var(--kr-font-size-sm);
  color: var(--kr-amber-strong);
}

.error {
  font-size: var(--kr-font-size-sm);
  color: var(--kr-red-strong);
  line-height: 1.4;
}

.hint {
  font-size: 11px;
  color: var(--kr-text-muted);
}
</style>
