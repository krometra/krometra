<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
const { t, locale } = useI18n();
import { computed } from "vue";
import { LOCALE_HTML_LANG } from "@/lib/i18n/locale";
import KrButton from "@/components/ui/KrButton.vue";

const props = defineProps<{ projectId: string; lastSyncedAt: Date | null }>();

const syncedLabel = computed(() =>
  props.lastSyncedAt ? props.lastSyncedAt.toLocaleTimeString(LOCALE_HTML_LANG[locale.value]) : t("editorPanels.connecting"),
);

function edit() {
  window.location.assign(`/editor/${props.projectId}`);
}
</script>

<template>
  <div
    :class="$style.banner"
    role="status"
    data-testid="watch-mode"
    :title="t('editorPanels.watch_hint')"
  >
    <span :class="$style.dot" />
    <span>{{ t("editorPanels.watch_status", { time: syncedLabel }) }}</span>
    <KrButton variant="secondary" size="sm" @click="edit">{{ t("editorPanels.edit") }}</KrButton>
  </div>
</template>

<style module>
.banner {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 6px 12px;
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
  background: var(--kr-green-strong, #2e9d5b);
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}
</style>
