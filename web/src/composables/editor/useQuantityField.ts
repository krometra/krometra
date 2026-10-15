import { computed, ref } from "vue";
import { evaluateQuantity } from "@/lib/expr";
import type { Dimension, Quantity } from "@/lib/units";

export interface QuantityFieldOptions {
  dimension: Dimension;
  initial: number;
  variables: () => Record<string, Quantity>;
  rangeError: (value: number) => string | null;
}

function formatValue(value: number): string {
  return String(Number(value.toFixed(3)));
}

export function useQuantityField(options: QuantityFieldOptions) {
  const value = ref(options.initial);
  const text = ref(formatValue(options.initial));
  const error = ref<string | null>(null);
  const invalid = computed(() => error.value !== null);

  function onInput() {
    const result = evaluateQuantity(text.value, options.dimension, options.variables());
    error.value = result.ok ? options.rangeError(result.value) : result.error;
    if (result.ok && error.value === null) value.value = result.value;
  }

  function commit() {
    onInput();
    if (error.value === null) text.value = formatValue(value.value);
  }

  function set(next: number) {
    value.value = next;
    error.value = null;
    text.value = formatValue(next);
  }

  return { value, text, error, invalid, onInput, commit, set };
}

export type QuantityField = ReturnType<typeof useQuantityField>;
