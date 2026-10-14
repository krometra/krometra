<script setup lang="ts">
import { computed } from "vue";
import CsButton from "@/components/ui/CsButton.vue";

const props = defineProps<{ projectId: string; lastSyncedAt: Date | null }>();

const syncedLabel = computed(() =>
  props.lastSyncedAt ? props.lastSyncedAt.toLocaleTimeString("ru-RU") : "подключение…",
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
    title="Режим наблюдения: модель обновляется сама, правки и автосохранение отключены, чтобы не мешать ИИ-агенту"
  >
    <span :class="$style.dot" />
    <span>Наблюдение · {{ syncedLabel }}</span>
    <CsButton variant="secondary" size="sm" @click="edit">Редактировать</CsButton>
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
  border: 1px solid var(--cs-border-strong);
  border-radius: 999px;
  background: var(--cs-surface-raised, var(--cs-surface));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-size: 13px;
  color: var(--cs-text);
  white-space: nowrap;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cs-green-strong, #2e9d5b);
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}
</style>
