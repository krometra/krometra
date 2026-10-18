<script setup lang="ts">
import { computed } from "vue";
import * as tooltip from "@zag-js/tooltip";
import { useMachine, normalizeProps } from "@zag-js/vue";

const props = withDefaults(
  defineProps<{
    content?: string;
    position?: string;
  }>(),
  {
    content: "",
  }
);

const id = `kr-tooltip-${Math.random().toString(36).slice(2, 9)}`;

const [state, send] = useMachine(
  tooltip.machine({
    id,
    openDelay: 300,
    closeDelay: 100,
  })
);

const api = computed(() =>
  tooltip.connect(state.value, send, normalizeProps)
);
</script>

<template>
  <span :class="$style.root">
    <span v-bind="api.getTriggerProps()">
      <slot />
    </span>
    <Teleport to="body">
      <div
        v-if="api.open && props.content"
        :class="$style.content"
        v-bind="api.getContentProps()"
      >
        {{ props.content }}
      </div>
    </Teleport>
  </span>
</template>

<style module>
.root {
  display: inline-flex;
}

.content {
  position: fixed;
  z-index: 1500;
  padding: var(--kr-spacing-xs) var(--kr-spacing-sm);
  background: var(--kr-surface-raised);
  border: 1px solid var(--kr-border-strong);
  border-radius: var(--kr-radius-sm);
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text);
  box-shadow: var(--kr-shadow-md);
  white-space: nowrap;
  pointer-events: none;
}
</style>
