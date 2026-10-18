<script setup lang="ts">
import { computed, watch } from "vue";
import * as numberInput from "@zag-js/number-input";
import { useMachine, normalizeProps } from "@zag-js/vue";

const props = withDefaults(
  defineProps<{
    modelValue?: number;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    suffix?: string;
    placeholder?: string;
  }>(),
  {
    modelValue: 0,
    step: 1,
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

const id = `kr-number-${Math.random().toString(36).slice(2, 9)}`;

const [state, send] = useMachine(
  numberInput.machine({
    id,
    value: String(props.modelValue),
    min: props.min,
    max: props.max,
    step: props.step,
    // en-US, а не ru-RU: с русской локалью разделителем считается запятая, и
    // точка из «0.4» молча выбрасывалась — поле показывало 4. Точку набирают
    // и с цифровой клавиатуры, и вставкой, поэтому её принимаем как основную,
    // а запятую нормализуем в onInput ниже.
    locale: "en-US",
    translations: {
      valueText: (value: string) => value,
      incrementLabel: "Увеличить",
      decrementLabel: "Уменьшить",
    },
  })
);

const api = computed(() =>
  numberInput.connect(state.value, send, normalizeProps)
);

/** Запятая — привычный десятичный разделитель: подменяем её точкой на лету. */
function normalizeSeparator(event: Event) {
  const e = event as InputEvent;
  if (e.data !== "," ) return;
  e.preventDefault();
  const input = e.target as HTMLInputElement;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(".", start, end, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

watch(
  () => props.modelValue,
  (val) => {
    if (api.value.valueAsNumber !== val) {
      api.value.setValue(val);
    }
  }
);

watch(
  () => api.value.valueAsNumber,
  (val) => {
    if (!isNaN(val) && val !== props.modelValue) {
      emit("update:modelValue", val);
    }
  }
);
</script>

<template>
  <div :class="$style.wrapper" v-bind="api.getRootProps()">
    <label v-if="label" :class="$style.label" v-bind="api.getLabelProps()">
      {{ label }}
    </label>
    <div :class="$style.control">
      <button :class="$style.btn" v-bind="api.getDecrementTriggerProps()">
        −
      </button>
      <input
        :class="$style.input"
        :placeholder="placeholder"
        v-bind="api.getInputProps()"
        @beforeinput="normalizeSeparator"
      />
      <button :class="$style.btn" v-bind="api.getIncrementTriggerProps()">
        +
      </button>
      <span v-if="suffix" :class="$style.suffix">{{ suffix }}</span>
    </div>
  </div>
</template>

<style module>
.wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-xs);
  width: 100%;
  min-width: 0;
}

.label {
  font-size: var(--kr-font-size-sm);
  font-weight: var(--kr-font-weight-medium);
  color: var(--kr-text-secondary);
}

.control {
  display: flex;
  align-items: center;
  background: var(--kr-surface-sunken);
  border: 1px solid var(--kr-border-strong);
  border-radius: var(--kr-radius-md);
  overflow: hidden;
  transition: border-color var(--kr-transition-fast);
}

.control:focus-within {
  border-color: var(--kr-border-focus);
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: var(--kr-text-secondary);
  font-size: 16px;
  cursor: pointer;
  transition: background var(--kr-transition-fast), color var(--kr-transition-fast);
  flex-shrink: 0;
}

.btn:hover {
  background: var(--kr-surface-hover);
  color: var(--kr-text);
}

.input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--kr-text);
  font-family: var(--kr-font-mono);
  font-size: var(--kr-font-size-sm);
  text-align: center;
  outline: none;
  padding: var(--kr-spacing-xs) 0;
  width: 0;
  min-width: 0;
}

.suffix {
  padding: 0 var(--kr-spacing-sm);
  font-family: var(--kr-font-mono);
  font-size: var(--kr-font-size-xs);
  color: var(--kr-amber-strong);
  flex-shrink: 0;
}
</style>
