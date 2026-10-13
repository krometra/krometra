<script setup lang="ts">
import CsButton from "@/components/ui/CsButton.vue";
import CsCheckbox from "@/components/ui/CsCheckbox.vue";
import CsIcon from "@/components/ui/CsIcon.vue";
import type { EdgeGroupRow } from "@/composables/viewport/edgeLabels";

defineProps<{
  rows: EdgeGroupRow[];
  chain: boolean;
}>();

const emit = defineEmits<{
  "update:chain": [enabled: boolean];
  remove: [row: EdgeGroupRow];
  highlight: [row: EdgeGroupRow];
  unhighlight: [];
}>();
</script>

<template>
  <div :class="$style.selection">
    <CsCheckbox
      :model-value="chain"
      label="Касательная цепочка"
      data-testid="edge-chain-toggle"
      @update:model-value="emit('update:chain', $event)"
    />
    <ul
      v-if="rows.length > 0"
      :class="$style.list"
      data-testid="edge-selection-list"
      @mouseleave="emit('unhighlight')"
    >
      <li
        v-for="(row, index) in rows"
        :key="row.key"
        :class="$style.row"
        data-testid="edge-selection-row"
        @mouseenter="emit('highlight', row)"
      >
        <span :class="$style.index">{{ index + 1 }}</span>
        <span :class="$style.label">{{ row.label }}</span>
        <CsButton
          variant="ghost"
          size="sm"
          :aria-label="`Снять с выбора: ${row.label}`"
          data-testid="edge-selection-remove"
          @click="emit('remove', row)"
        >
          <CsIcon name="close" :size="12" />
        </CsButton>
      </li>
    </ul>
  </div>
</template>

<style module>
.selection {
  display: flex;
  flex-direction: column;
  gap: var(--cs-spacing-sm);
}

.list {
  max-height: 168px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--cs-border);
  border-radius: var(--cs-radius-md);
  background: var(--cs-surface-sunken);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--cs-spacing-sm);
  padding: 0 var(--cs-spacing-xs) 0 var(--cs-spacing-sm);
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
}

.row + .row {
  border-top: 1px solid var(--cs-border-subtle);
}

.row:hover {
  background: var(--cs-surface-hover);
  color: var(--cs-text);
}

.index {
  flex-shrink: 0;
  min-width: var(--cs-spacing-md);
  font-family: var(--cs-font-mono);
  color: var(--cs-text-muted);
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
