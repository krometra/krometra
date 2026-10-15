<script setup lang="ts">
import { onMounted, ref } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsInput from "@/components/ui/CsInput.vue";
import styles from "./dimension-overlay.module.css";

defineProps<{
  x: number;
  y: number;
  title: string;
  text: string;
  error: string | null;
}>();

const emit = defineEmits<{
  (e: "update:text", value: string): void;
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();

const rootRef = ref<HTMLElement | null>(null);

onMounted(() => {
  setTimeout(() => {
    const input = rootRef.value?.querySelector("input");
    input?.focus();
    input?.select();
  }, 0);
});
</script>

<template>
  <div ref="rootRef" :class="styles.overlay" data-sketch-ui data-testid="dimension-input" :style="{ left: x + 'px', top: y + 'px' }">
    <div :class="styles.fieldLabel">
      <span>{{ title }}</span>
      <CsInput
        :class="[styles.input, $style.input]"
        :model-value="text"
        :error="error ?? undefined"
        :aria-label="title"
        title="Значение или выражение с единицами: 20, 3/4 in, width/2"
        inputmode="decimal"
        @update:model-value="emit('update:text', $event)"
        @keydown.enter.prevent="emit('confirm')"
        @keydown.escape.prevent="emit('cancel')"
      />
    </div>
    <div :class="styles.actions">
      <CsButton variant="ghost" size="sm" :class="styles.okBtn" aria-label="Подтвердить значение" @click="emit('confirm')">✓</CsButton>
      <CsButton variant="ghost" size="sm" :class="styles.cancelBtn" aria-label="Отменить ввод" @click="emit('cancel')">✕</CsButton>
    </div>
  </div>
</template>

<style module>
.input.input {
  width: 96px;
}
</style>
