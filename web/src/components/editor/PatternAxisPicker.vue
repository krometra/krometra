<script setup lang="ts">
import { computed } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import type { GlobalAxis, PatternAxisRef } from "@/lib/bodyPattern";
import { axisRefLabel } from "@/lib/bodyPatternParams";
import type { PatternPickKind } from "@/lib/patternForm";

const props = defineProps<{
  label: string;
  axis: PatternAxisRef | null;
  picking: PatternPickKind | null;
  pickHint: string;
  testId: string;
}>();

const emit = defineEmits<{
  global: [axis: GlobalAxis];
  pick: [kind: PatternPickKind];
  cancel: [];
}>();

const names = useDisplayNames();

const GLOBAL_AXES: { axis: GlobalAxis; label: string }[] = [
  { axis: "x", label: "X" },
  { axis: "y", label: "Y" },
  { axis: "z", label: "Z" },
];

const PICKS: { kind: PatternPickKind; label: string }[] = [
  { kind: "edge", label: "Ребро" },
  { kind: "face", label: "Грань" },
];

const status = computed(() => (props.picking ? props.pickHint : axisRefLabel(props.axis, names.bodyLabel)));

function isActive(kind: string): boolean {
  return props.picking ? props.picking === kind : props.axis?.kind === kind;
}
</script>

<template>
  <div :class="$style.field" :data-testid="testId">
    <span :class="$style.label">{{ label }}</span>
    <div :class="$style.row">
      <CsButton
        v-for="option in GLOBAL_AXES"
        :key="option.axis"
        size="sm"
        :variant="isActive(option.axis) ? 'primary' : 'secondary'"
        :data-testid="`${testId}-${option.axis}`"
        @click="emit('global', option.axis)"
      >
        {{ option.label }}
      </CsButton>
      <CsButton
        v-for="option in PICKS"
        :key="option.kind"
        size="sm"
        :variant="isActive(option.kind) ? 'primary' : 'secondary'"
        :data-testid="`${testId}-${option.kind}`"
        @click="emit('pick', option.kind)"
      >
        {{ option.label }}
      </CsButton>
    </div>
    <span :class="[$style.hint, picking && $style.hintActive]" :data-testid="`${testId}-status`">
      {{ status }}
      <CsButton v-if="picking" size="sm" variant="ghost" @click="emit('cancel')">Отмена</CsButton>
    </span>
  </div>
</template>

<style module>
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-muted);
}

.hintActive {
  color: var(--cs-amber-strong);
}
</style>
