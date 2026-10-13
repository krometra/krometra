<script setup lang="ts">
// Плавающее поле ввода одного значения (размерное ограничение, отступ
// вспомогательной прямой) с подтверждением и отменой.
import styles from "./dimension-overlay.module.css";
import CsButton from "@/components/ui/CsButton.vue";
import CsInput from "@/components/ui/CsInput.vue";

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
    <CsInput
      :class="styles.input"
      :model-value="modelValue"
      :placeholder="placeholder"
      @update:model-value="emit('update:modelValue', $event)"
      @keyup.enter="emit('confirm')"
      @keyup.escape="emit('cancel')"
    />
    <div :class="styles.actions">
      <CsButton variant="ghost" size="sm" :class="styles.okBtn" aria-label="Подтвердить значение" @click="emit('confirm')">✓</CsButton>
      <CsButton variant="ghost" size="sm" :class="styles.cancelBtn" aria-label="Отменить ввод" @click="emit('cancel')">✕</CsButton>
    </div>
  </div>
</template>
