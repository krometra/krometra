<script setup lang="ts">
import { FxCheckbox } from "foxy-ui-kit";

defineProps<{
  modelValue?: boolean;
  label?: string;
  disabled?: boolean;
}>();

defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <FxCheckbox
    :model-value="modelValue"
    :label="label"
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
