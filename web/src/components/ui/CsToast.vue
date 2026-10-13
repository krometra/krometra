<script setup lang="ts">
import { ref } from "vue";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "warning" | "info";
}

let nextId = 0;
const toasts = ref<Toast[]>([]);

function addToast(message: string, type: Toast["type"] = "info", duration = 4000) {
  const id = nextId++;
  toasts.value.push({ id, message, type });
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, duration);
}

function removeToast(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

// Expose for external use
defineExpose({ addToast });

// Make available globally
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__csToast = { addToast };
}
</script>

<template>
  <Teleport to="body">
    <div :class="$style.container">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="[$style.toast, $style[toast.type]]"
          @click="removeToast(toast.id)"
        >
          {{ toast.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style module>
.container {
  position: fixed;
  top: var(--cs-spacing-md);
  right: var(--cs-spacing-md);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: var(--cs-spacing-sm);
  pointer-events: none;
}

.toast {
  padding: var(--cs-spacing-sm) var(--cs-spacing-md);
  border-radius: var(--cs-radius-md);
  font-size: var(--cs-font-size-sm);
  box-shadow: var(--cs-shadow-md);
  cursor: pointer;
  pointer-events: auto;
  max-width: 360px;
  animation: slideIn 0.3s ease;
}

.success {
  background: var(--cs-success);
  color: white;
}

.error {
  background: var(--cs-error);
  color: white;
}

.warning {
  background: var(--cs-warning);
  color: var(--cs-surface);
}

.info {
  background: var(--cs-primary);
  color: var(--cs-surface);
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* TransitionGroup classes */
:global(.toast-enter-active) {
  transition: all 0.3s ease;
}
:global(.toast-leave-active) {
  transition: all 0.2s ease;
}
:global(.toast-enter-from) {
  transform: translateX(100%);
  opacity: 0;
}
:global(.toast-leave-to) {
  transform: translateX(100%);
  opacity: 0;
}
</style>
