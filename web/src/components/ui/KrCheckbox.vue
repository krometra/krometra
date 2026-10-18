<script setup lang="ts">
import { KCheckbox } from "@krometra/ui-kit";

defineProps<{
  modelValue?: boolean;
  label?: string;
  disabled?: boolean;
}>();

defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <KCheckbox
    :model-value="modelValue"
    :label="label"
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
