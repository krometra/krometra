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
  gap: var(--kr-spacing-md);
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--kr-spacing-md);
  border: 1px solid var(--kr-border-subtle);
  border-radius: var(--kr-radius-lg);
  background: var(--kr-surface-raised);
}

.label {
  color: var(--kr-text-secondary);
  font-size: var(--kr-font-size-sm);
}

.value {
  font-size: var(--kr-font-size-xl);
  font-weight: var(--kr-font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.hint {
  color: var(--kr-text-muted);
  font-size: var(--kr-font-size-xs);
  line-height: 1.4;
}
</style>
