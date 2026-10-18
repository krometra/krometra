<script setup lang="ts">
// Плавающее поле ввода отступа вспомогательной прямой с подтверждением и отменой.
import styles from "./dimension-overlay.module.css";
import KrButton from "@/components/ui/KrButton.vue";
import KrInput from "@/components/ui/KrInput.vue";

defineProps<{
  x: number;
  y: number;
  modelValue: string;
  placeholder: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();
</script>

<template>
  <div :class="styles.overlay" data-sketch-ui :style="{ left: x + 'px', top: y + 'px' }">
    <KrInput
      :class="styles.input"
      :model-value="modelValue"
      :placeholder="placeholder"
      @update:model-value="emit('update:modelValue', $event)"
      @keyup.enter="emit('confirm')"
      @keyup.escape="emit('cancel')"
    />
    <div :class="styles.actions">
      <KrButton variant="ghost" size="sm" :class="styles.okBtn" aria-label="Подтвердить значение" @click="emit('confirm')">✓</KrButton>
      <KrButton variant="ghost" size="sm" :class="styles.cancelBtn" aria-label="Отменить ввод" @click="emit('cancel')">✕</KrButton>
    </div>
  </div>
</template>
