// Shared parameter state — parametric expressions system
// Parameters are stored in document.metadata.parameters

import { ref, computed } from "vue";
import { createSharedComposable } from "@vueuse/core";
import type { Parameter } from "@/types/api";

export const useParameters = createSharedComposable(() => {
  const parameters = ref<Parameter[]>([]);

  function loadFromDocument(doc: { metadata?: Record<string, unknown> } | null) {
    const raw = doc?.metadata?.parameters;
    if (Array.isArray(raw)) {
      parameters.value = raw as Parameter[];
    } else {
      parameters.value = [];
    }
  }

  function toDocumentMetadata(): Parameter[] {
    return parameters.value;
  }

  function add(name: string, value: number, unit: string): Parameter {
    const p: Parameter = {
      id: `param-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      value,
      unit,
    };
    parameters.value = [...parameters.value, p];
    return p;
  }

  function remove(id: string) {
    parameters.value = parameters.value.filter((p) => p.id !== id);
  }

  function update(id: string, changes: Partial<Omit<Parameter, "id">>) {
    parameters.value = parameters.value.map((p) =>
      p.id === id ? { ...p, ...changes } : p,
    );
  }

  /** Resolve a parameter expression like "=width" to its numeric value. Returns null if not found. */
  function resolve(expr: string): number | null {
    if (!expr.startsWith("=")) return null;
    const name = expr.slice(1).trim();
    const p = parameters.value.find((p) => p.name === name);
    return p?.value ?? null;
  }

  /** Check if a string looks like a parameter reference (starts with "=") */
  function isParamRef(expr: string): boolean {
    return expr.startsWith("=");
  }

  const count = computed(() => parameters.value.length);

  return {
    parameters,
    loadFromDocument,
    toDocumentMetadata,
    add,
    remove,
    update,
    resolve,
    isParamRef,
    count,
  };
});
