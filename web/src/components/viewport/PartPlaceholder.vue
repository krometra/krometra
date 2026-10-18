<script setup lang="ts">
import { computed } from "vue";
import { buildPart, type IsoView } from "@/lib/iso";

const props = withDefaults(
  defineProps<{
    variant?: "viewport" | "thumbnail";
    topColor?: string;
    selected?: boolean;
  }>(),
  { variant: "viewport", selected: false },
);

const isViewport = computed(() => props.variant === "viewport");

const view = computed<IsoView>(() =>
  isViewport.value
    ? { scale: 2.4, ox: 350, oy: 250 }
    : { scale: 0.62, ox: 120, oy: 86 },
);

const viewBox = computed(() => (isViewport.value ? "0 0 700 460" : "0 0 240 150"));

const part = computed(() => buildPart(view.value));
</script>

<template>
  <div :class="[$style.stage, isViewport ? $style.viewport : $style.thumb]">
    <svg :viewBox="viewBox" :class="$style.svg" preserveAspectRatio="xMidYMid meet">
      <!-- base box -->
      <polygon :points="part.baseL" fill="oklch(0.58 0.035 244)" stroke="oklch(0.43 0.035 244)" stroke-width="0.8" />
      <polygon :points="part.baseR" fill="oklch(0.47 0.028 244)" stroke="oklch(0.38 0.025 244)" stroke-width="0.8" />
      <polygon
        :points="part.baseTop"
        :fill="topColor || 'oklch(0.72 0.05 244)'"
        stroke="oklch(0.46 0.035 244)"
        stroke-width="0.8"
      />

      <template v-if="isViewport">
        <ellipse
          v-for="(h, i) in part.holes"
          :key="i"
          :cx="h.cx"
          :cy="h.cy"
          rx="9"
          ry="5"
          fill="oklch(0.30 0.025 244)"
          stroke="oklch(0.52 0.03 244)"
          stroke-width="1"
        />
        <polygon :points="part.bossL" fill="oklch(0.62 0.04 244)" stroke="oklch(0.45 0.03 244)" stroke-width="0.8" />
        <polygon :points="part.bossR" fill="oklch(0.52 0.03 244)" stroke="oklch(0.40 0.025 244)" stroke-width="0.8" />
        <polygon :points="part.bossTop" fill="oklch(0.78 0.06 244)" stroke="oklch(0.50 0.035 244)" stroke-width="0.8" />
        <polygon
          v-if="selected"
          :points="part.bossTop"
          fill="none"
          stroke="var(--kr-primary)"
          stroke-width="2"
        />
        <polyline :points="part.dimPts" fill="none" stroke="var(--kr-amber)" stroke-width="1.2" />
        <text
          :x="part.dimX"
          :y="part.dimY"
          fill="var(--kr-amber)"
          font-family="var(--kr-font-mono)"
          font-size="14"
          text-anchor="middle"
        >120,0 мм</text>
      </template>
    </svg>
  </div>
</template>

<style module>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  background:
    radial-gradient(120% 120% at 50% 30%, oklch(0.985 0.012 244), oklch(0.94 0.009 250)),
    linear-gradient(var(--kr-grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--kr-grid-line) 1px, transparent 1px);
}

.viewport {
  background:
    radial-gradient(130% 110% at 50% 36%, oklch(0.99 0.012 244), oklch(0.94 0.009 250)),
    linear-gradient(oklch(0.74 0.012 250 / 0.55) 1px, transparent 1px),
    linear-gradient(90deg, oklch(0.74 0.012 250 / 0.55) 1px, transparent 1px);
  background-size: 100% 100%, 30px 30px, 30px 30px;
}

.thumb {
  background-size: 100% 100%, 22px 22px, 22px 22px;
}

.svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
</style>
