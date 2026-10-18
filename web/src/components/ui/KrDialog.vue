<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from "vue";

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{ "update:open": [value: boolean] }>();

function close() {
  emit("update:open", false);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.open) {
    e.stopPropagation();
    close();
  }
}

// Телепорт + leave-анимация: если владелец диалога размонтируется по ходу
// закрытия (переход на другой роут), узел остаётся висеть в body поверх
// нового экрана — держим ссылку и убираем его руками.
let node: HTMLElement | null = null;

watch(
  () => props.open,
  (open) => {
    if (!open) node = null;
  },
);

onMounted(() => window.addEventListener("keydown", onKeyDown));

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
  node?.remove();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="kr-dialog" @enter="(el) => (node = el as HTMLElement)">
      <div v-if="open" :class="$style.root">
        <div :class="$style.backdrop" @click="close" />
        <div :class="$style.positioner">
          <div :class="$style.content" role="dialog" aria-modal="true">
            <div :class="$style.head">
              <h2 :class="$style.title"><slot name="title">Диалог</slot></h2>
              <button :class="$style.close" type="button" aria-label="Закрыть" @click="close">✕</button>
            </div>
            <div :class="$style.body"><slot /></div>
            <div :class="$style.footer"><slot name="footer" /></div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style module>
.root {
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.backdrop {
  position: absolute;
  inset: 0;
  background: var(--kr-overlay);
  backdrop-filter: blur(3px);
}

.positioner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--kr-spacing-md);
}

.content {
  position: relative;
  width: 100%;
  max-width: 440px;
  background: var(--kr-surface-raised);
  border: 1px solid var(--kr-border-strong);
  border-radius: 14px;
  box-shadow: var(--kr-shadow-lg);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid var(--kr-border);
}

.title {
  font-size: 16px;
  font-weight: var(--kr-font-weight-bold);
  color: var(--kr-text);
}

.close {
  margin-left: auto;
  background: transparent;
  border: none;
  color: var(--kr-text-secondary);
  font-size: 16px;
  cursor: pointer;
  transition: color var(--kr-transition-fast);
}

.close:hover {
  color: var(--kr-text);
}

.body {
  padding: 22px;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--kr-spacing-sm);
  padding: 14px 22px;
  border-top: 1px solid var(--kr-border);
}
</style>

<style>
.kr-dialog-enter-active,
.kr-dialog-leave-active {
  transition: opacity var(--kr-transition-fast);
}

.kr-dialog-enter-from,
.kr-dialog-leave-to {
  opacity: 0;
}
</style>
