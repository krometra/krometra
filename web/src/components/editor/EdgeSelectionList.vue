<script setup lang="ts">
import KrButton from "@/components/ui/KrButton.vue";
import KrCheckbox from "@/components/ui/KrCheckbox.vue";
import KrIcon from "@/components/ui/KrIcon.vue";
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
    <KrCheckbox
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
        <KrButton
          variant="ghost"
          size="sm"
          :aria-label="`Снять с выбора: ${row.label}`"
          data-testid="edge-selection-remove"
          @click="emit('remove', row)"
        >
          <KrIcon name="close" :size="12" />
        </KrButton>
      </li>
    </ul>
  </div>
</template>

<style module>
.selection {
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-sm);
}

.list {
  max-height: 168px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--kr-border);
  border-radius: var(--kr-radius-md);
  background: var(--kr-surface-sunken);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--kr-spacing-sm);
  padding: 0 var(--kr-spacing-xs) 0 var(--kr-spacing-sm);
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-secondary);
}

.row + .row {
  border-top: 1px solid var(--kr-border-subtle);
}

.row:hover {
  background: var(--kr-surface-hover);
  color: var(--kr-text);
}

.index {
  flex-shrink: 0;
  min-width: var(--kr-spacing-md);
  font-family: var(--kr-font-mono);
  color: var(--kr-text-muted);
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
