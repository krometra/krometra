<template>
  <div :class="$style.badge" role="status" data-testid="ai-control" title="ИИ-агент управляет редактором через MCP: его правки видны вживую">
    <span :class="$style.dot" />
    ИИ-агент управляет редактором
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
  background: var(--cs-primary);
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}
</style>
