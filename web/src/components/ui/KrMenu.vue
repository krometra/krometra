<script setup lang="ts">
import { computed } from "vue";
import * as menu from "@zag-js/menu";
import { useMachine, normalizeProps } from "@zag-js/vue";

interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  action?: () => void;
}

const props = withDefaults(
  defineProps<{
    items?: MenuItem[];
  }>(),
  {
    items: () => [],
  }
);

const id = `kr-menu-${Math.random().toString(36).slice(2, 9)}`;

const [state, send] = useMachine(
  menu.machine({
    id,
  })
);

const api = computed(() => menu.connect(state.value, send, normalizeProps));

function handleSelect(value: string) {
  const item = props.items.find((i) => i.id === value);
  item?.action?.();
}
</script>

<template>
  <div :class="$style.root">
    <span v-bind="api.getTriggerProps()">
      <slot />
    </span>
    <Teleport to="body">
      <div
        v-if="api.open"
        :class="$style.positioner"
        v-bind="api.getPositionerProps()"
      >
        <div :class="$style.content" v-bind="api.getContentProps()">
          <div
            v-for="item in props.items"
            :key="item.id"
            :class="$style.item"
            v-bind="api.getItemProps({ value: item.id })"
            @click="handleSelect(item.id)"
          >
            <span v-if="item.icon" :class="$style.icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style module>
.root {
  display: inline-flex;
}

.positioner {
  position: fixed;
  z-index: 1200;
}

.content {
  background: var(--kr-surface-raised);
  border: 1px solid var(--kr-border-strong);
  border-radius: var(--kr-radius-md);
  box-shadow: var(--kr-shadow-md);
  padding: var(--kr-spacing-xs);
  min-width: 180px;
}

.item {
  display: flex;
  align-items: center;
  gap: var(--kr-spacing-sm);
  padding: var(--kr-spacing-xs) var(--kr-spacing-sm);
  border-radius: var(--kr-radius-sm);
  font-size: var(--kr-font-size-sm);
  color: var(--kr-text-secondary);
  cursor: pointer;
  transition: background var(--kr-transition-fast), color var(--kr-transition-fast);
}

.item:hover {
  background: var(--kr-surface-hover);
  color: var(--kr-text);
}

.icon {
  font-size: var(--kr-font-size-md);
  width: 20px;
  text-align: center;
}
</style>
