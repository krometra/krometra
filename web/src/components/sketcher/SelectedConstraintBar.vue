<script setup lang="ts">
import type { SketchConstraint } from "@/types/api";
import CsButton from "@/components/ui/CsButton.vue";
import { CONSTRAINT_ICONS, CONSTRAINT_TITLES } from "@/sketcher/constraintNames";

defineProps<{ constraint: SketchConstraint }>();

const emit = defineEmits<{
  (e: "delete"): void;
  (e: "clear"): void;
}>();
</script>

<template>
  <div :class="$style.bar" data-sketch-ui data-testid="selected-constraint-bar">
    <span :class="$style.icon">{{ CONSTRAINT_ICONS[constraint.type] }}</span>
    <span :class="$style.title">Ограничение: {{ CONSTRAINT_TITLES[constraint.type] }}</span>
    <CsButton size="sm" variant="danger" data-testid="delete-constraint" @click="emit('delete')">Удалить (Del)</CsButton>
    <CsButton size="sm" variant="ghost" @click="emit('clear')">Снять выбор</CsButton>
  </div>
</template>

<style module>
.bar {
  min-height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  box-sizing: border-box;
  background: var(--cs-primary-soft);
  border-bottom: 1px solid var(--cs-primary-border);
}

.icon {
  font-family: var(--cs-font-mono);
  font-size: 13px;
  color: var(--cs-primary);
}

.title {
  font-family: var(--cs-font-mono);
  font-size: 12px;
  color: var(--cs-text);
  margin-right: auto;
}
</style>
