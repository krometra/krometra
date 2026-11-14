<script setup lang="ts">
import { useSketchText } from "@/composables/sketcher/useSketchText";
const tr = useSketchText();
import { useI18n } from "@/composables/shared/useI18n";
const { t } = useI18n();
import { onMounted, ref } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrInput from "@/components/ui/KrInput.vue";
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
      <span>{{ tr(title) }}</span>
      <KrInput
        :class="[styles.input, $style.input]"
        :model-value="text"
        :error="error ? tr(error) : undefined"
        :aria-label="tr(title)"
        :placeholder="tr(title)"
        :title="t('sketch.inputHint')"
        inputmode="decimal"
        @update:model-value="emit('update:text', $event)"
        @keydown.enter.prevent="emit('confirm')"
        @keydown.escape.prevent="emit('cancel')"
      />
    </div>
    <div :class="styles.actions">
      <KrButton variant="ghost" size="sm" :class="styles.okBtn" :aria-label="t('sketch.confirm')" @click="emit('confirm')">✓</KrButton>
      <KrButton variant="ghost" size="sm" :class="styles.cancelBtn" :aria-label="t('sketch.cancelInput')" @click="emit('cancel')">✕</KrButton>
    </div>
  </div>
</template>

<style module>
.input.input {
  width: 96px;
}
</style>
