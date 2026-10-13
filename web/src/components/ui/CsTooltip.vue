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

const id = `cs-tooltip-${Math.random().toString(36).slice(2, 9)}`;

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
  padding: var(--cs-spacing-xs) var(--cs-spacing-sm);
  background: var(--cs-surface-raised);
  border: 1px solid var(--cs-border-strong);
  border-radius: var(--cs-radius-sm);
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text);
  box-shadow: var(--cs-shadow-md);
  white-space: nowrap;
  pointer-events: none;
}
</style>
