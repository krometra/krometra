<script setup lang="ts">
import { computed } from "vue";
import type { AdminOperationStat } from "@/types/api";
import { formatCount } from "@/lib/admin/format";
import { operationBars } from "@/lib/admin/overviewView";
import { pluralize } from "@/lib/plural";

const props = defineProps<{ operations: AdminOperationStat[]; periodDays: number }>();

const bars = computed(() => operationBars(props.operations));
</script>

<template>
  <div :class="$style.root" data-testid="admin-operations">
    <p v-if="!bars.length" :class="$style.empty">Операций пока нет.</p>
    <div v-for="bar in bars" :key="bar.kind" :class="$style.row" :data-testid="`admin-operation-${bar.kind}`">
      <div :class="$style.label">{{ bar.label }}</div>
      <div :class="$style.track">
        <div :class="$style.fill" :style="{ width: `${Math.max(bar.share * 100, 1)}%` }" />
      </div>
      <div :class="$style.count">{{ formatCount(bar.count) }}</div>
      <div :class="$style.meta">
        в {{ pluralize(bar.projects, "проекте", "проектах", "проектах") }} · {{ formatCount(bar.periodCount) }} за {{ periodDays }} дн.
      </div>
    </div>
  </div>
</template>

<style module>
.root {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty {
  margin: 0;
  color: var(--kr-text-muted);
  font-size: var(--kr-font-size-sm);
}

.row {
  display: grid;
  grid-template-columns: 130px 1fr 48px 200px;
  align-items: center;
  gap: var(--kr-spacing-sm);
  font-size: var(--kr-font-size-sm);
}

.label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track {
  height: 10px;
  border-radius: var(--kr-radius-full);
  background: var(--kr-surface-sunken);
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: var(--kr-radius-full);
  background: var(--kr-primary);
}

.count {
  text-align: right;
  font-weight: var(--kr-font-weight-medium);
  font-variant-numeric: tabular-nums;
}

.meta {
  color: var(--kr-text-muted);
  font-size: var(--kr-font-size-xs);
}

@media (max-width: 720px) {
  .row {
    grid-template-columns: 110px 1fr 48px;
  }

  .meta {
    display: none;
  }
}
</style>
