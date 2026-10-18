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

const id = `kr-collapsible-${Math.random().toString(36).slice(2, 9)}`;

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
  border-bottom: 1px solid var(--kr-border-subtle);
}

.trigger {
  display: flex;
  align-items: center;
  gap: var(--kr-spacing-sm);
  width: 100%;
  background: transparent;
  border: none;
  color: var(--kr-text);
  font-size: var(--kr-font-size-sm);
  font-weight: var(--kr-font-weight-bold);
  padding: var(--kr-spacing-sm) 0;
  cursor: pointer;
  transition: color var(--kr-transition-fast);
}

.trigger:hover {
  color: var(--kr-primary);
}

.chevron {
  font-size: 10px;
  color: var(--kr-text-muted);
  transition: transform var(--kr-transition-fast);
  display: inline-block;
}

.chevronOpen {
  transform: rotate(90deg);
}

.label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: var(--kr-font-size-xs);
}

.content {
  padding: var(--kr-spacing-sm) 0 var(--kr-spacing-md);
}
</style>
