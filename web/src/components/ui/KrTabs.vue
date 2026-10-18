<script setup lang="ts">
import { computed, watch } from "vue";
import * as zagTabs from "@zag-js/tabs";
import { useMachine, normalizeProps } from "@zag-js/vue";

interface TabDef {
  id: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    tabs?: TabDef[];
    modelValue?: string;
  }>(),
  {
    tabs: () => [],
    modelValue: "",
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const id = `kr-tabs-${Math.random().toString(36).slice(2, 9)}`;

const [state, send] = useMachine(
  zagTabs.machine({
    id,
    value: props.modelValue || undefined,
  })
);

const api = computed(() => zagTabs.connect(state.value, send, normalizeProps));

watch(
  () => props.modelValue,
  (val) => {
    if (api.value.value !== val) {
      api.value.setValue(val);
    }
  }
);

watch(
  () => api.value.value,
  (val) => {
    if (val !== props.modelValue && val !== null) {
      emit("update:modelValue", val);
    }
  }
);
</script>

<template>
  <div :class="$style.root" v-bind="api.getRootProps()">
    <div :class="$style.list" v-bind="api.getListProps()">
      <button
        v-for="tab in props.tabs"
        :key="tab.id"
        :class="[
          $style.trigger,
          api.value === tab.id ? $style.triggerActive : '',
        ]"
        v-bind="api.getTriggerProps({ value: tab.id })"
      >
        {{ tab.label }}
      </button>
    </div>
    <div :class="$style.content">
      <slot />
    </div>
  </div>
</template>

<style module>
.root {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.list {
  display: flex;
  border-bottom: 1px solid var(--kr-border-subtle);
}

.trigger {
  flex: 1;
  padding: var(--kr-spacing-xs) var(--kr-spacing-sm);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--kr-text-secondary);
  font-size: var(--kr-font-size-sm);
  font-weight: var(--kr-font-weight-medium);
  cursor: pointer;
  transition: color var(--kr-transition-fast), border-color var(--kr-transition-fast);
}

.trigger:focus {
  outline: none;
}

.trigger:focus-visible {
  outline: 2px solid var(--kr-border-focus);
  outline-offset: -2px;
  border-radius: var(--kr-radius-sm);
}

.trigger:hover {
  color: var(--kr-text);
}

.triggerActive {
  color: var(--kr-text);
  border-bottom-color: var(--kr-primary);
}

.content {
  padding: var(--kr-spacing-sm) 0;
}
</style>
