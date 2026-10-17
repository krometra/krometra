<script setup lang="ts">
import CsButton from "@/components/ui/CsButton.vue";

defineProps<{ error: string | null }>();

const emit = defineEmits<{ cancel: [] }>();
</script>

<template>
  <div :class="$style.banner" data-testid="sketch-plane-pick-banner">
    <span>Кликните базовую плоскость или плоскую грань тела, либо рабочую плоскость</span>
    <span v-if="error" :class="$style.error">{{ error }}</span>
    <CsButton variant="secondary" size="sm" @click="emit('cancel')">Отмена (Esc)</CsButton>
  </div>
</template>

<style module>
.banner {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 90%;
  padding: 10px 16px;
  background: var(--cs-surface-raised);
  border: 1px solid var(--cs-primary);
  border-radius: 10px;
  color: var(--cs-text);
  font-size: 13px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.error {
  color: var(--cs-error);
  font-size: 12px;
}
</style>
