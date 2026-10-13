<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import type { CtxItem } from "@/composables/editor/types";

defineProps<{
  x: number;
  y: number;
  items: CtxItem[];
}>();

const emit = defineEmits<{ close: [] }>();

function onWindowClick() {
  emit("close");
}

onMounted(() => window.addEventListener("click", onWindowClick));
onUnmounted(() => window.removeEventListener("click", onWindowClick));

function onItemClick(item: CtxItem) {
  item.action();
  emit("close");
}
</script>

<template>
  <div
    role="menu"
    :class="$style.ctxMenu"
    :style="{ left: x + 'px', top: y + 'px' }"
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
  color: var(--cs-error);
}

.ctxItemDanger:hover {
  color: var(--cs-error);
}
</style>
