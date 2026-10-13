<script setup lang="ts">
import { FxInput } from "foxy-ui-kit";

defineProps<{
  modelValue?: string;
  label?: string;
  type?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  autocomplete?: string;
}>();

</script>

<template>
  <FxInput
    :model-value="modelValue"
    :label="label"
    :type="type || 'text'"
    :placeholder="placeholder"
    :disabled="disabled"
    :autocomplete="autocomplete"
    :error="error"
    :hint="hint"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
