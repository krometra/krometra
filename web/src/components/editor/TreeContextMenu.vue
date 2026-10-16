<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import type { CtxItem } from "@/composables/editor/types";
import { clampMenuPosition } from "@/lib/menuPosition";

const props = defineProps<{
  x: number;
  y: number;
  items: CtxItem[];
}>();

const emit = defineEmits<{ close: [] }>();

function onWindowClick() {
  emit("close");
}

const root = ref<HTMLElement | null>(null);
const position = ref({ left: props.x, top: props.y });

onMounted(() => {
  window.addEventListener("click", onWindowClick);
  const box = root.value?.getBoundingClientRect();
  if (box) position.value = clampMenuPosition(props.x, props.y, box, { width: window.innerWidth, height: window.innerHeight });
});
onUnmounted(() => window.removeEventListener("click", onWindowClick));

function onItemClick(item: CtxItem) {
  item.action();
  emit("close");
}
</script>

<template>
  <div
    ref="root"
    role="menu"
    :class="$style.ctxMenu"
    :style="{ left: position.left + 'px', top: position.top + 'px' }"
    @contextmenu.prevent
  >
    <div
      v-for="(item, i) in items"
      :key="i"
      role="menuitem"
      tabindex="0"
      :class="[$style.ctxItem, item.danger && $style.ctxItemDanger]"
      @click="onItemClick(item)"
      @keydown.enter="onItemClick(item)"
    >
      {{ item.label }}
    </div>
  </div>
</template>

<style module>
.ctxMenu {
  position: fixed;
  z-index: 1300;
  min-width: 190px;
  padding: 4px;
  background: var(--cs-surface-raised, #252535);
  border: 1px solid var(--cs-border-strong);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  max-height: calc(100vh - 16px);
  overflow-y: auto;
}

.ctxItem {
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--cs-text-secondary);
  cursor: pointer;
}

.ctxItem:hover {
  background: var(--cs-surface-hover);
  color: var(--cs-text);
}

.ctxItemDanger {
  color: var(--cs-red-strong);
}

.ctxItemDanger:hover {
  color: var(--cs-red-strong);
}
</style>
