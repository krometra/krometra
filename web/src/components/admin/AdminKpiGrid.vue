<script setup lang="ts">
import type { KpiTile } from "@/lib/admin/overviewView";

defineProps<{ tiles: KpiTile[] }>();
</script>

<template>
  <div :class="$style.grid">
    <div v-for="tile in tiles" :key="tile.id" :class="$style.tile" :data-testid="`admin-kpi-${tile.id}`">
      <div :class="$style.label">{{ tile.label }}</div>
      <div :class="$style.value">{{ tile.value }}</div>
      <div :class="$style.hint">{{ tile.hint }}</div>
    </div>
  </div>
</template>

<style module>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: var(--cs-spacing-md);
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--cs-spacing-md);
  border: 1px solid var(--cs-border-subtle);
  border-radius: var(--cs-radius-lg);
  background: var(--cs-surface-raised);
}

.label {
  color: var(--cs-text-secondary);
  font-size: var(--cs-font-size-sm);
}

.value {
  font-size: var(--cs-font-size-xl);
  font-weight: var(--cs-font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.hint {
  color: var(--cs-text-muted);
  font-size: var(--cs-font-size-xs);
  line-height: 1.4;
}
</style>
