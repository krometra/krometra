<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import { wordmarkFor } from "./krometraWordmark";

const props = withDefaults(defineProps<{ size?: number; showText?: boolean }>(), {
  size: 26,
  showText: true,
});

const { locale, t } = useI18n();

const wordmark = computed(() => wordmarkFor(locale.value));
const textHeight = computed(() => Math.round(props.size * 0.84));
const textWidth = computed(() => Math.round(textHeight.value * wordmark.value.aspect));
const gap = computed(() => `${Math.round(props.size * 0.24)}px`);
</script>

<template>
  <div :class="$style.logo" :style="{ gap }" role="img" :aria-label="t('common.productName')">
    <svg :class="$style.mark" :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 16 16 2.5 27.7 9.25Z" :class="$style.faceLight" />
      <path d="M16 16 27.7 9.25v13.5Z" :class="$style.faceDark" />
      <path d="M16 16 27.7 22.75 16 29.5Z" :class="$style.face" />
      <path d="M16 2.5 4.3 9.25v13.5L16 29.5Z" :class="$style.face" />
      <path d="M16 3.5v25M16 16l10.8-6.2M16 16l10.8 6.2" :class="$style.letter" />
    </svg>
    <svg
      v-if="showText"
      :class="$style.text"
      :width="textWidth"
      :height="textHeight"
      :viewBox="wordmark.viewBox"
      aria-hidden="true"
    >
      <path :d="wordmark.d" />
    </svg>
  </div>
</template>

<style module>
.logo {
  display: inline-flex;
  align-items: center;
}

.mark {
  flex-shrink: 0;
}

.face {
  fill: var(--cs-primary);
}

.faceLight {
  fill: var(--cs-logo-face-light);
}

.faceDark {
  fill: var(--cs-logo-face-dark);
}

.letter {
  fill: none;
  stroke: var(--cs-primary-fg);
  stroke-width: 2.4;
  stroke-linecap: round;
}

.text {
  flex-shrink: 0;
  fill: currentColor;
}
</style>
