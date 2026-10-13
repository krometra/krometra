<script setup lang="ts">
/** Триада осей: следит за камерой, показывает мировые X/Y/Z сцены (Z-up). */
import { computed } from "vue";
import * as THREE from "three";
import { projectAxes, WORLD_UP } from "@/lib/orientation";

const props = defineProps<{
  cameraPosition: { x: number; y: number; z: number };
  cameraTarget: { x: number; y: number; z: number };
  cameraUp?: { x: number; y: number; z: number };
}>();

const SIZE = 74;
const CENTER = SIZE / 2;
const LENGTH = 26;

const axes = computed(() => {
  const eye = new THREE.Vector3(props.cameraPosition.x, props.cameraPosition.y, props.cameraPosition.z);
  const target = new THREE.Vector3(props.cameraTarget.x, props.cameraTarget.y, props.cameraTarget.z);
  const up = props.cameraUp
    ? new THREE.Vector3(props.cameraUp.x, props.cameraUp.y, props.cameraUp.z)
    : WORLD_UP.clone();

  return projectAxes(eye, target, up, LENGTH).map((axis) => ({
    ...axis,
    x: CENTER + axis.dx,
    y: CENTER + axis.dy,
  }));
});
</script>

<template>
  <div :class="$style.triad">
    <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" :width="SIZE" :height="SIZE" data-testid="axis-triad">
      <g v-for="axis in axes" :key="axis.name">
        <line :x1="CENTER" :y1="CENTER" :x2="axis.x" :y2="axis.y" :stroke="axis.color" stroke-width="2" />
        <text
          :x="axis.x"
          :y="axis.y"
          :fill="axis.color"
          font-family="var(--cs-font-mono)"
          font-size="10"
          text-anchor="middle"
          dominant-baseline="central"
        >{{ axis.name }}</text>
      </g>
    </svg>
  </div>
</template>

<style module>
.triad {
  position: absolute;
  left: 18px;
  bottom: 16px;
  pointer-events: none;
}
</style>
