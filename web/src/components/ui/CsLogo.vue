<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";

withDefaults(defineProps<{ size?: number; showText?: boolean }>(), {
  size: 26,
  showText: true,
});

const { t } = useI18n();
</script>

<template>
  <div :class="$style.logo">
    <svg :class="$style.mark" :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 5h13l9 11-9 11H5V5Z" :class="$style.frame" />
      <path d="M10 9v14m0-7h6m0 0 7-7m-7 7 7 7" :class="$style.letter" />
      <circle cx="16" cy="16" r="2" :class="$style.node" />
    </svg>
    <span v-if="showText" :class="$style.text">{{ t("common.productName") }}</span>
  </div>
</template>

<style module>
.logo {
  display: inline-flex;
  align-items: center;
  gap: 11px;
}

.mark {
  flex-shrink: 0;
  overflow: visible;
}

.frame {
  fill: none;
  stroke: var(--cs-primary);
  stroke-width: 1.5;
  opacity: 0.45;
  stroke-linejoin: round;
}

.letter {
  fill: none;
  stroke: var(--cs-primary);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.node {
  fill: var(--cs-primary);
}

.text {
  font-weight: var(--cs-font-weight-bold);
  font-size: 16px;
  letter-spacing: -0.02em;
}
</style>
