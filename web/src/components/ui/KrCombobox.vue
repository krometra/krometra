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

const id = `kr-combobox-${Math.random().toString(36).slice(2, 9)}`;

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
  background: var(--kr-surface-sunken);
  border: 1px solid var(--kr-border-strong);
  border-radius: var(--kr-radius-md);
  transition: border-color var(--kr-transition-fast);
}

.control:focus-within {
  border-color: var(--kr-border-focus);
}

.input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--kr-text);
  font-family: var(--kr-font-mono);
  font-size: var(--kr-font-size-sm);
  padding: var(--kr-spacing-sm) var(--kr-spacing-md);
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
  color: var(--kr-text-muted);
  font-size: 11px;
  cursor: pointer;
  border-radius: var(--kr-radius-sm);
  transition: color var(--kr-transition-fast);
}

.clear:hover {
  color: var(--kr-text);
}

.arrow {
  padding: 0 var(--kr-spacing-sm);
  color: var(--kr-text-muted);
  font-size: 10px;
}

.list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  margin-top: var(--kr-spacing-xs);
}

.options {
  background: var(--kr-surface-raised);
  border: 1px solid var(--kr-border-strong);
  border-radius: var(--kr-radius-md);
  box-shadow: var(--kr-shadow-md);
  list-style: none;
  margin: 0;
  padding: var(--kr-spacing-xs);
  max-height: 200px;
  overflow: auto;
}

.option {
  padding: var(--kr-spacing-xs) var(--kr-spacing-sm);
  border-radius: var(--kr-radius-sm);
  font-size: var(--kr-font-size-sm);
  color: var(--kr-text-secondary);
  cursor: pointer;
  transition: background var(--kr-transition-fast), color var(--kr-transition-fast);
}

.option:hover {
  background: var(--kr-surface-hover);
  color: var(--kr-text);
}

.optionSelected {
  color: var(--kr-text);
  background: var(--kr-primary-soft);
}
</style>
