<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
const { t } = useI18n();
</script>

<template>
  <div :class="$style.badge" role="status" data-testid="ai-control" :title="t('editorPanels.an_ai_agent_controls_the_editor_through_mcp_i')">
    <span :class="$style.dot" />
    {{ t("editorPanels.ai_agent_is_controlling_the_editor") }}
  </div>
</template>

<style module>
.badge {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid var(--kr-border-strong);
  border-radius: 999px;
  background: var(--kr-surface-raised, var(--kr-surface));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-size: 13px;
  color: var(--kr-text);
  white-space: nowrap;

}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--kr-primary);
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}
</style>
