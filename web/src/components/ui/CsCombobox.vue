<script setup lang="ts">
import { computed, watch } from "vue";
import * as combobox from "@zag-js/combobox";
import { ListCollection } from "@zag-js/collection";
import { useMachine, normalizeProps } from "@zag-js/vue";

interface Option {
  label: string;
  value: string;
}

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    options?: Option[];
    placeholder?: string;
  }>(),
  {
    modelValue: "",
    options: () => [],
    placeholder: "Выбрать…",
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const id = `cs-combobox-${Math.random().toString(36).slice(2, 9)}`;

function makeCollection(opts: Option[]) {
  return new ListCollection({
    items: opts,
    itemToValue: (item: Option) => item.value,
    itemToString: (item: Option) => item.label,
  });
}

const [state, send] = useMachine(
  combobox.machine<Option>({
    id,
    collection: makeCollection(props.options),
    inputValue: props.modelValue
      ? props.options.find((o) => o.value === props.modelValue)?.label ?? ""
      : "",
  })
);

const api = computed(() =>
  combobox.connect(state.value, send, normalizeProps)
);

watch(
  () => props.modelValue,
  (val) => {
    if (api.value.value?.[0] !== val) {
      api.value.setValue(val ? [val] : []);
    }
  }
);

watch(
  () => api.value.value,
  (val) => {
    const selected = val?.[0] ?? "";
    if (selected !== props.modelValue) {
      emit("update:modelValue", selected);
    }
  }
);

watch(
  () => props.options,
  (opts) => {
    api.value.setCollection(makeCollection(opts));
  },
  { deep: true }
);
</script>

<template>
  <div :class="$style.wrapper" v-bind="api.getRootProps()">
    <div :class="$style.control" v-bind="api.getControlProps()">
      <input
        :class="$style.input"
        :placeholder="placeholder"
        v-bind="api.getInputProps()"
      />
      <button v-if="api.value?.[0]" :class="$style.clear" v-bind="api.getClearTriggerProps()">✕</button>
      <span :class="$style.arrow">▾</span>
    </div>
    <div
      v-if="api.open"
      :class="$style.list"
      v-bind="api.getPositionerProps()"
    >
      <ul :class="$style.options" v-bind="api.getContentProps()">
        <li
          v-for="opt in props.options"
          :key="opt.value"
          :class="[
            $style.option,
            api.value?.[0] === opt.value ? $style.optionSelected : '',
          ]"
          v-bind="api.getItemProps({ item: opt })"
        >
          {{ opt.label }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style module>
.wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  position: relative;
}

.control {
  display: flex;
  align-items: center;
  background: var(--cs-surface-sunken);
  border: 1px solid var(--cs-border-strong);
  border-radius: var(--cs-radius-md);
  transition: border-color var(--cs-transition-fast);
}

.control:focus-within {
  border-color: var(--cs-border-focus);
}

.input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--cs-text);
  font-family: var(--cs-font-mono);
  font-size: var(--cs-font-size-sm);
  padding: var(--cs-spacing-sm) var(--cs-spacing-md);
  outline: none;
  height: 36px;
  min-width: 0;
}

.clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  color: var(--cs-text-muted);
  font-size: 11px;
  cursor: pointer;
  border-radius: var(--cs-radius-sm);
  transition: color var(--cs-transition-fast);
}

.clear:hover {
  color: var(--cs-text);
}

.arrow {
  padding: 0 var(--cs-spacing-sm);
  color: var(--cs-text-muted);
  font-size: 10px;
}

.list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  margin-top: var(--cs-spacing-xs);
}

.options {
  background: var(--cs-surface-raised);
  border: 1px solid var(--cs-border-strong);
  border-radius: var(--cs-radius-md);
  box-shadow: var(--cs-shadow-md);
  list-style: none;
  margin: 0;
  padding: var(--cs-spacing-xs);
  max-height: 200px;
  overflow: auto;
}

.option {
  padding: var(--cs-spacing-xs) var(--cs-spacing-sm);
  border-radius: var(--cs-radius-sm);
  font-size: var(--cs-font-size-sm);
  color: var(--cs-text-secondary);
  cursor: pointer;
  transition: background var(--cs-transition-fast), color var(--cs-transition-fast);
}

.option:hover {
  background: var(--cs-surface-hover);
  color: var(--cs-text);
}

.optionSelected {
  color: var(--cs-text);
  background: var(--cs-primary-soft);
}
</style>
