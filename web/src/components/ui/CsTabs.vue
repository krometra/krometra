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

const id = `cs-tabs-${Math.random().toString(36).slice(2, 9)}`;

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
  border-bottom: 1px solid var(--cs-border-subtle);
}

.trigger {
  flex: 1;
  padding: var(--cs-spacing-xs) var(--cs-spacing-sm);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--cs-text-secondary);
  font-size: var(--cs-font-size-sm);
  font-weight: var(--cs-font-weight-medium);
  cursor: pointer;
  transition: color var(--cs-transition-fast), border-color var(--cs-transition-fast);
}

.trigger:hover {
  color: var(--cs-text);
}

.triggerActive {
  color: var(--cs-text);
  border-bottom-color: var(--cs-primary);
}

.content {
  padding: var(--cs-spacing-sm) 0;
}
</style>
