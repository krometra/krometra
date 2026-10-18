<script setup lang="ts">
// Живой ввод размеров рисуемой фигуры (Ш/В прямоугольника, R окружности).
import { computed, ref, watch } from "vue";
import KrInput from "@/components/ui/KrInput.vue";
import type { LiveDimField } from "@/composables/sketcher/useLiveDimensions";
import styles from "./dimension-overlay.module.css";

const props = defineProps<{
  x: number;
  y: number;
  fields: LiveDimField[];
}>();

const emit = defineEmits<{
  (e: "input"): void;
  (e: "next-field", index: number): void;
  (e: "commit"): void;
  (e: "cancel"): void;
}>();

const fieldRows = ref<HTMLElement[]>([]);
const inputs = computed(() =>
  fieldRows.value
    .map((row) => row.querySelector<HTMLInputElement>("input"))
    .filter((input): input is HTMLInputElement => input !== null)
);

defineExpose({ inputs });

watch(
  () => props.fields,
  () => {
    fieldRows.value = [];
  }
);
</script>

<template>
  <div :class="styles.overlay" data-sketch-ui :style="{ left: x + 'px', top: y + 'px' }">
    <div v-for="(field, i) in fields" :key="field.key" ref="fieldRows" :class="styles.fieldLabel">
      <span>{{ field.label }}</span>
      <KrInput
        :model-value="field.value"
        :class="[styles.input, styles.fieldInput]"
        :placeholder="field.live"
        inputmode="decimal"
        :aria-label="field.label"
        @update:model-value="field.value = $event; emit('input')"
        @keydown.tab.prevent="emit('next-field', i)"
        @keyup.enter="emit('commit')"
        @keyup.escape="emit('cancel')"
      />
    </div>
  </div>
</template>
