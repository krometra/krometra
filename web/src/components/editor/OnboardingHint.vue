<script setup lang="ts">
import CsButton from "@/components/ui/CsButton.vue";
import CsIcon from "@/components/ui/CsIcon.vue";
import type { OnboardingHint } from "@/composables/editor/useOnboarding";

defineProps<{ hint: OnboardingHint }>();

const emit = defineEmits<{ act: []; dismiss: [] }>();
</script>

<template>
  <div :class="[$style.root, hint.variant === 'pill' ? $style.pill : $style.center]">
    <CsIcon v-if="hint.variant === 'pill'" name="lightbulb" :size="16" :class="$style.bulb" />

    <div :class="$style.text">
      <div :class="$style.title">{{ hint.title }}</div>
      <div :class="$style.body">{{ hint.body }}</div>
    </div>

    <div :class="$style.actions">
      <CsButton size="sm" :class="$style.cta" @click="emit('act')">
        {{ hint.cta }}
        <span :class="$style.key">{{ hint.hotkey }}</span>
      </CsButton>
      <CsButton
        variant="ghost"
        size="sm"
        :class="$style.dismiss"
        title="Скрыть подсказку"
        aria-label="Скрыть подсказку"
        @click="emit('dismiss')"
      >
        <CsIcon name="close" :size="14" />
      </CsButton>
    </div>
  </div>
</template>

<style module>
.root {
  position: absolute;
  z-index: 12;
  pointer-events: none;
  user-select: none;
}

/* Кликабельны только кнопки: текст подсказки в центре растянут на весь
   вьюпорт и иначе съедал клики по модели, попутно выделяясь синим. */
.root .actions {
  pointer-events: auto;
}

.center {
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
}

.pill {
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(560px, 80%);
  padding: 10px 12px 10px 14px;
  background: oklch(1 0 0 / 0.94);
  border: 1px solid var(--cs-border-strong);
  border-radius: 10px;
  backdrop-filter: blur(6px);
  box-shadow: var(--cs-shadow-md);
  pointer-events: auto;
}

.center .text {
  padding: 14px 18px;
  border-radius: 12px;
  background: oklch(1 0 0 / 0.88);
  backdrop-filter: blur(4px);
}

.bulb {
  color: var(--cs-amber);
  flex-shrink: 0;
}

.center .title {
  font-size: 19px;
  font-weight: var(--cs-font-weight-bold);
  color: var(--cs-text);
}

.pill .title {
  font-size: 13px;
  font-weight: var(--cs-font-weight-bold);
  color: var(--cs-text);
}

.center .body {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  max-width: 380px;
  color: var(--cs-text-secondary);
}

.pill .body {
  font-size: 12px;
  color: var(--cs-text-secondary);
}

.pill .text {
  min-width: 0;
}

.actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.center .actions {
  margin-top: 6px;
}

/* Размеры подсказки крупнее дефолтного CsButton size="sm" — держим прежний вид. */
.cta.cta {
  gap: 8px;
  height: auto;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: var(--cs-font-weight-bold);
  border-radius: 8px;
}

.key {
  font-family: var(--cs-font-mono);
  font-size: 10.5px;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 4px;
  background: oklch(1 0 0 / 0.18);
}

.dismiss.dismiss {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
  color: var(--cs-text-muted);
}

.dismiss.dismiss:hover {
  color: var(--cs-text);
}
</style>
