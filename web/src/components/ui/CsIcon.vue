<script setup lang="ts">
import { computed } from "vue";
import { ICONS, type IconName, type IconPath } from "./icons";

const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), {
  size: 16,
});

const paths = computed<IconPath[]>(() => ICONS[props.name] ?? []);
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-for="(p, i) in paths"
      :key="i"
      :d="p.d"
      :fill="p.fill ? 'currentColor' : 'none'"
      :fill-opacity="p.fill ? 0.85 : undefined"
      :stroke-dasharray="p.dashed ? '2 2.5' : undefined"
      :opacity="p.faded ? 0.5 : undefined"
    />
  </svg>
</template>
