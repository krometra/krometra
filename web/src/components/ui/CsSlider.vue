<script setup lang="ts">
const props = defineProps<{
  modelValue: number;
  min: number;
  max: number;
  step: number;
  label: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

function onInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) emit("update:modelValue", value);
}
</script>

<template>
  <input
    type="range"
    :class="$style.slider"
    :value="props.modelValue"
    :min="props.min"
    :max="props.max"
    :step="props.step"
    :aria-label="props.label"
    @input="onInput"
  />
</template>

<style module>
.slider {
  width: 100%;
  margin: 0;
  accent-color: var(--cs-primary);
  cursor: pointer;
}

.slider:focus-visible {
  outline: 2px solid var(--cs-border-focus);
  outline-offset: 2px;
}
</style>
