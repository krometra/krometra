<script setup lang="ts">
import { computed } from "vue";
import type { AdminDailyPoint } from "@/types/api";
import { buildChart } from "@/lib/admin/chart";
import { formatDay } from "@/lib/admin/format";
import { chartSeries } from "@/lib/admin/overviewView";

const props = defineProps<{ points: AdminDailyPoint[] }>();

const WIDTH = 720;
const HEIGHT = 220;
const COLORS: Record<string, string> = {
  registrations: "var(--kr-primary)",
  projects: "var(--kr-amber-strong)",
  active_users: "var(--kr-teal-strong)",
};

const chart = computed(() =>
  buildChart({
    days: props.points.map((point) => point.date),
    series: chartSeries(props.points),
    width: WIDTH,
    height: HEIGHT,
    formatDay,
  }),
);
const drawOrder = computed(() => [...chart.value.lines].reverse());
</script>

<template>
  <figure :class="$style.root" data-testid="admin-activity-chart">
    <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" :class="$style.svg" role="img" aria-label="Активность по дням">
      <g v-for="tick in chart.ticks" :key="tick.value">
        <line :x1="chart.box.left" :x2="chart.box.right" :y1="tick.y" :y2="tick.y" :class="$style.grid" />
        <text :x="chart.box.left - 8" :y="tick.y" :class="$style.tick" text-anchor="end" dominant-baseline="middle">
          {{ tick.value }}
        </text>
      </g>
      <text v-for="label in chart.labels" :key="label.x" :x="label.x" :y="HEIGHT - 8" :class="$style.tick" text-anchor="middle">
        {{ label.text }}
      </text>
      <g v-for="line in drawOrder" :key="line.key" :style="{ color: COLORS[line.key] }">
        <path :d="line.path" :class="$style.line" />
        <circle v-for="point in line.points" :key="point.x" :cx="point.x" :cy="point.y" r="2.5" :class="$style.dot" />
      </g>
      <rect
        v-for="column in chart.columns"
        :key="column.x"
        :x="column.x"
        :y="chart.box.top"
        :width="column.width"
        :height="chart.box.bottom - chart.box.top"
        :class="$style.hover"
      >
        <title>{{ column.title }}</title>
      </rect>
    </svg>
    <figcaption :class="$style.legend">
      <span v-for="line in chart.lines" :key="line.key" :class="$style.legendItem">
        <span :class="$style.swatch" :style="{ background: COLORS[line.key] }" />{{ line.label }}
      </span>
    </figcaption>
  </figure>
</template>

<style module>
.root {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-sm);
}

.svg {
  width: 100%;
  height: auto;
  display: block;
}

.grid {
  stroke: var(--kr-border-subtle);
  stroke-width: 1;
}

.tick {
  fill: var(--kr-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.line {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.dot {
  fill: currentColor;
}

.hover {
  fill: transparent;
}

.hover:hover {
  fill: var(--kr-surface-hover);
  fill-opacity: 0.5;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--kr-spacing-md);
  color: var(--kr-text-secondary);
  font-size: var(--kr-font-size-xs);
}

.legendItem {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.swatch {
  width: 12px;
  height: 3px;
  border-radius: var(--kr-radius-full);
}
</style>
