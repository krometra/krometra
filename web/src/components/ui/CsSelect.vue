<script setup lang="ts">
import { computed, watch } from "vue";
import * as select from "@zag-js/select";
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
    label?: string;
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

const id = `cs-select-${Math.random().toString(36).slice(2, 9)}`;

function makeCollection(opts: Option[]) {
  return new ListCollection({
    items: opts,
    itemToValue: (item: Option) => item.value,
    itemToString: (item: Option) => item.label,
  });
}

const [state, send] = useMachine(
  select.machine<Option>({
    id,
    collection: makeCollection(props.options),
    value: props.modelValue ? [props.modelValue] : [],
  })
);

const api = computed(() => select.connect(state.value, send, normalizeProps));

watch(
  () => props.modelValue,
  (val) => {
    const current = api.value.value;
    if (current?.[0] !== val) {
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
    <label v-if="label" :class="$style.label" v-bind="api.getLabelProps()">
      {{ label }}
    </label>
    <button :class="$style.trigger" v-bind="api.getTriggerProps()">
      <span :class="$style.triggerText">
        {{
          api.value?.[0]
            ? props.options.find((o) => o.value === api.value[0])?.label ??
              props.placeholder
            : props.placeholder
        }}
      </span>
      <span :class="[$style.arrow, api.open ? $style.arrowOpen : '']">▾</span>
    </button>
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
          <span
            v-if="api.value?.[0] === opt.value"
            :class="$style.check"
          >✓</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style module>
.wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--cs-spacing-xs);
  width: 100%;
  position: relative;
}

.label {
  font-size: var(--cs-font-size-sm);
  font-weight: var(--cs-font-weight-medium);
  color: var(--cs-text-secondary);
}

.trigger {
  display: flex;
  align-items: center;
  gap: var(--cs-spacing-sm);
  background: var(--cs-surface-sunken);
  border: 1px solid var(--cs-border-strong);
  border-radius: var(--cs-radius-md);
  color: var(--cs-text);
  font-size: var(--cs-font-size-sm);
  padding: var(--cs-spacing-sm) var(--cs-spacing-md);
  cursor: pointer;
  height: 36px;
  transition: border-color var(--cs-transition-fast);
}

.trigger:hover {
  border-color: var(--cs-primary-border);
}

.triggerText {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow {
  font-size: 10px;
  color: var(--cs-text-muted);
  transition: transform var(--cs-transition-fast);
}

.arrowOpen {
  transform: rotate(180deg);
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
  max-height: 240px;
  overflow: auto;
}

.option {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.check {
  font-size: var(--cs-font-size-xs);
  color: var(--cs-primary);
}
</style>
