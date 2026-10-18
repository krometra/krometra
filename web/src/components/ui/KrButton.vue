<script setup lang="ts">
import { KButton } from "@krometra/ui-kit";

defineProps<{
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit" | "reset";
}>();
</script>

<template>
  <KButton
    :variant="variant || 'primary'"
    :size="size || 'md'"
    :disabled="disabled"
    :loading="loading"
    :html-type="type || 'button'"
  >
    <slot />
  </KButton>
</template>
