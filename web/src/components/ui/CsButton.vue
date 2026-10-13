<script setup lang="ts">
import { FxButton } from "foxy-ui-kit";

defineProps<{
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit" | "reset";
}>();
</script>

<template>
  <FxButton
    :variant="variant || 'primary'"
    :size="size || 'md'"
    :disabled="disabled"
    :loading="loading"
    :html-type="type || 'button'"
  >
    <slot />
  </FxButton>
</template>
