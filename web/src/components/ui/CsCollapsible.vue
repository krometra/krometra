<script setup lang="ts">
import { computed, watch } from "vue";
import * as collapsible from "@zag-js/collapsible";
import { useMachine, normalizeProps } from "@zag-js/vue";

const props = withDefaults(
  defineProps<{
    open?: boolean;
    label?: string;
  }>(),
  {
    open: true,
    label: "",
  }
);

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const id = `cs-collapsible-${Math.random().toString(36).slice(2, 9)}`;

const [state, send] = useMachine(
  collapsible.machine({
    id,
    open: props.open,
  })
);

const api = computed(() =>
  collapsible.connect(state.value, send, normalizeProps)
);

watch(
  () => props.open,
  (val) => {
    if (api.value.open !== val) {
      api.value.setOpen(val);
    }
  }
);

watch(
  () => api.value.open,
  (val) => {
    if (val !== props.open) {
      emit("update:open", val);
    }
  }
);
</script>

<template>
  <div :class="$style.root" v-bind="api.getRootProps()">
    <button :class="$style.trigger" v-bind="api.getTriggerProps()">
      <span :class="[$style.chevron, api.open ? $style.chevronOpen : '']"
        >▸</span
      >
      <span :class="$style.label">{{ label }}</span>
    </button>
    <div :class="$style.content" v-bind="api.getContentProps()">
      <slot />
    </div>
  </div>
</template>

<style module>
.root {
  border-bottom: 1px solid var(--cs-border-subtle);
}

.trigger {
  display: flex;
  align-items: center;
  gap: var(--cs-spacing-sm);
  width: 100%;
  background: transparent;
  border: none;
  color: var(--cs-text);
  font-size: var(--cs-font-size-sm);
  font-weight: var(--cs-font-weight-bold);
  padding: var(--cs-spacing-sm) 0;
  cursor: pointer;
  transition: color var(--cs-transition-fast);
}

.trigger:hover {
  color: var(--cs-primary);
}

.chevron {
  font-size: 10px;
  color: var(--cs-text-muted);
  transition: transform var(--cs-transition-fast);
  display: inline-block;
}

.chevronOpen {
  transform: rotate(90deg);
}

.label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: var(--cs-font-size-xs);
}

.content {
  padding: var(--cs-spacing-sm) 0 var(--cs-spacing-md);
}
</style>
