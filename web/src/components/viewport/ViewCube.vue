<script setup lang="ts">
/**
 * Interactive ViewCube — CSS 3D transform cube overlay for viewport.
 * - Renders a 3D cube with labeled faces (FRONT, BACK, TOP, BOTTOM, LEFT, RIGHT)
 * - Rotates synchronously with the camera to reflect current view angle
 * - Click face → animate camera to canonical view
 * - Click edge → intermediate isometric view
 * - Click vertex → isometric view
 * - Home button resets to default isometry
 */
import { computed } from "vue";
import * as THREE from "three";
import CsIcon from "@/components/ui/CsIcon.vue";
import {
  CANONICAL_VIEWS,
  type CanonicalView,
} from "@/composables/useViewCube";
import { toCubeSpace } from "@/lib/orientation";

const props = defineProps<{
  /** Current camera world position */
  cameraPosition: { x: number; y: number; z: number };
  /** Current orbit target (look-at point) */
  cameraTarget: { x: number; y: number; z: number };
}>();

const emit = defineEmits<{
  "view-change": [view: CanonicalView];
  "view-iso": [];
}>();


/** Compute rotation of the cube to match camera orientation.
 *  The cube's FRONT face should point toward the camera's direction.
 *  We rotate the cube so that it represents the model's world axes. */
const cubeRotation = computed(() => {
  // Мир Z-up, CSS-куб Y-up — переводим направление камеры в оси куба
  const camDir = toCubeSpace(
    new THREE.Vector3(
      props.cameraPosition.x - props.cameraTarget.x,
      props.cameraPosition.y - props.cameraTarget.y,
      props.cameraPosition.z - props.cameraTarget.z,
    ),
  ).normalize();

  // Convert camera direction to Euler angles for CSS 3D rotation
  // We want the cube to rotate inversely so FRONT faces the camera
  const rotY = Math.atan2(-camDir.x, -camDir.z); // rotation around Y
  const rotX = Math.asin(camDir.y); // rotation around X

  return {
    rotateX: (-rotX * 180) / Math.PI,
    rotateY: (rotY * 180) / Math.PI,
  };
});

function handleFaceClick(viewName: string) {
  const view = CANONICAL_VIEWS[viewName];
  if (view) {
    emit("view-change", view);
  }
}

function handleEdgeClick() {
  emit("view-iso");
}

function handleVertexClick() {
  emit("view-iso");
}

function handleHomeClick() {
  emit("view-iso");
}

/**
 * Hit-test helper: given mouse event on the cube container, determine if
 * we clicked a face, edge, or vertex by checking the data attribute.
 * We use delegation: the click handler checks `data-face`, `data-edge`, `data-vertex`.
 */
function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  const face = target.closest("[data-face]");
  if (face) {
    const name = face.getAttribute("data-face");
    if (name) handleFaceClick(name);
    return;
  }
  const edge = target.closest("[data-edge]");
  if (edge) {
    handleEdgeClick();
    return;
  }
  const vertex = target.closest("[data-vertex]");
  if (vertex) {
    handleVertexClick();
    return;
  }
}

const vertices = [
  "v-ftl", "v-ftr", "v-fbl", "v-fbr",
  "v-btl", "v-btr", "v-bbl", "v-bbr",
];

const faceDefs = [
  { name: "front",  label: "FRONT",  class: "cubeFaceFront" },
  { name: "back",   label: "BACK",   class: "cubeFaceBack" },
  { name: "top",    label: "TOP",    class: "cubeFaceTop" },
  { name: "bottom", label: "BOTTOM", class: "cubeFaceBottom" },
  { name: "left",   label: "LEFT",   class: "cubeFaceLeft" },
  { name: "right",  label: "RIGHT",  class: "cubeFaceRight" },
];
</script>

<template>
  <div :class="$style.container">
    <!-- Home button -->
    <button
      :class="$style.homeBtn"
      title="Изометрия"
      aria-label="Изометрия"
      @click="handleHomeClick"
    >
      <CsIcon name="home" :size="14" />
    </button>

    <!-- 3D CSS Cube scene -->
    <div :class="$style.scene" @click="handleClick">
      <div
        :class="$style.cube"
        :style="{
          transform: `rotateX(${cubeRotation.rotateX}deg) rotateY(${cubeRotation.rotateY}deg)`,
        }"
      >
        <!-- Faces -->
        <div
          v-for="face in faceDefs"
          :key="face.name"
          :data-face="face.name"
          :class="[$style.face, $style[face.class as keyof typeof $style]]"
        >
          <span :class="$style.faceLabel">{{ face.label }}</span>
        </div>

        <!-- Edge overlay elements (thin strips at face borders) -->
        <!-- Front face edges -->
        <div data-edge="fe-top"    :class="[$style.edge, $style.edgeFrontTop]" />
        <div data-edge="fe-bottom" :class="[$style.edge, $style.edgeFrontBottom]" />
        <div data-edge="fe-left"   :class="[$style.edge, $style.edgeFrontLeft]" />
        <div data-edge="fe-right"  :class="[$style.edge, $style.edgeFrontRight]" />

        <!-- Back face edges (positioned via the outer cube rotation, these need to be on back face transform) -->
        <div data-edge="be-top"    :class="[$style.edge, $style.edgeBackTop]" />
        <div data-edge="be-bottom" :class="[$style.edge, $style.edgeBackBottom]" />
        <div data-edge="be-left"   :class="[$style.edge, $style.edgeBackLeft]" />
        <div data-edge="be-right"  :class="[$style.edge, $style.edgeBackRight]" />

        <!-- Top face edges (connecting top to sides) -->
        <div data-edge="te-front"  :class="[$style.edge, $style.edgeTopFront]" />
        <div data-edge="te-back"   :class="[$style.edge, $style.edgeTopBack]" />
        <div data-edge="te-left"   :class="[$style.edge, $style.edgeTopLeft]" />
        <div data-edge="te-right"  :class="[$style.edge, $style.edgeTopRight]" />

        <!-- Vertices (corners) -->
        <div
          v-for="v in vertices"
          :key="v"
          :data-vertex="v"
          :class="[$style.vertex, $style[v as keyof typeof $style]]"
        />
      </div>
    </div>
  </div>
</template>

<style module>
.container {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.container * {
  pointer-events: auto;
}

.homeBtn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--cs-border-strong);
  background: oklch(1 0 0 / 0.90);
  color: var(--cs-text-secondary);
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  transition: all var(--cs-transition-fast);
}

.homeBtn:hover {
  background: var(--cs-primary-soft);
  color: var(--cs-text);
  border-color: var(--cs-primary);
}

/* 3D scene with perspective */
.scene {
  width: 100px;
  height: 100px;
  perspective: 400px;
  cursor: pointer;
}

.cube {
  width: 100px;
  height: 100px;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.05s ease-out;
}

/* -- Faces -- */
.face {
  position: absolute;
  width: 100px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--cs-border-strong);
  background: oklch(0.98 0.008 244 / 0.88);
  backdrop-filter: blur(3px);
  transition: background var(--cs-transition-fast);
}

.face:hover {
  background: oklch(0.90 0.045 244 / 0.92);
}

.faceLabel {
  font-family: var(--cs-font-mono);
  font-size: 11px;
  font-weight: var(--cs-font-weight-bold);
  color: var(--cs-text-secondary);
  user-select: none;
  pointer-events: none;
}

.face:hover .faceLabel {
  color: var(--cs-text);
}

/* Each face positioned with CSS 3D transform */
.cubeFaceFront {
  transform: translateZ(50px);
}

.cubeFaceBack {
  transform: rotateY(180deg) translateZ(50px);
}

.cubeFaceLeft {
  transform: rotateY(-90deg) translateZ(50px);
}

.cubeFaceRight {
  transform: rotateY(90deg) translateZ(50px);
}

.cubeFaceTop {
  transform: rotateX(90deg) translateZ(50px);
}

.cubeFaceBottom {
  transform: rotateX(-90deg) translateZ(50px);
}

/* -- Edges (thin clickable strips along face borders) -- */
.edge {
  position: absolute;
  transition: background var(--cs-transition-fast);
  z-index: 2;
}

.edge:hover {
  background: oklch(0.52 0.15 244 / 0.35);
}

/* Front face edges */
.edgeFrontTop {
  top: -1px;
  left: 4px;
  right: 4px;
  height: 5px;
  transform: translateZ(50px);
}

.edgeFrontBottom {
  bottom: -1px;
  left: 4px;
  right: 4px;
  height: 5px;
  transform: translateZ(50px);
}

.edgeFrontLeft {
  left: -1px;
  top: 4px;
  bottom: 4px;
  width: 5px;
  transform: translateZ(50px);
}

.edgeFrontRight {
  right: -1px;
  top: 4px;
  bottom: 4px;
  width: 5px;
  transform: translateZ(50px);
}

/* Back face edges */
.edgeBackTop {
  top: -1px;
  left: 4px;
  right: 4px;
  height: 5px;
  transform: rotateY(180deg) translateZ(50px);
}

.edgeBackBottom {
  bottom: -1px;
  left: 4px;
  right: 4px;
  height: 5px;
  transform: rotateY(180deg) translateZ(50px);
}

.edgeBackLeft {
  right: -1px;
  top: 4px;
  bottom: 4px;
  width: 5px;
  transform: rotateY(180deg) translateZ(50px);
}

.edgeBackRight {
  left: -1px;
  top: 4px;
  bottom: 4px;
  width: 5px;
  transform: rotateY(180deg) translateZ(50px);
}

/* Top face edges (connecting top to sides) */
.edgeTopFront {
  top: -1px;
  left: 4px;
  right: 4px;
  height: 5px;
  transform: rotateX(90deg) translateZ(50px);
}

.edgeTopBack {
  bottom: -1px;
  left: 4px;
  right: 4px;
  height: 5px;
  transform: rotateX(90deg) translateZ(50px);
}

.edgeTopLeft {
  left: -1px;
  top: 4px;
  bottom: 4px;
  width: 5px;
  transform: rotateX(90deg) translateZ(50px);
}

.edgeTopRight {
  right: -1px;
  top: 4px;
  bottom: 4px;
  width: 5px;
  transform: rotateX(90deg) translateZ(50px);
}

/* -- Vertices (clickable corners) -- */
.vertex {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: background var(--cs-transition-fast);
  z-index: 3;
}

.vertex:hover {
  background: oklch(0.65 0.15 233 / 0.70);
}

/* Front face vertices (z=50) */
.v-ftl { top: -4px; left: -4px; transform: translateZ(50px); }
.v-ftr { top: -4px; right: -4px; transform: translateZ(50px); }
.v-fbl { bottom: -4px; left: -4px; transform: translateZ(50px); }
.v-fbr { bottom: -4px; right: -4px; transform: translateZ(50px); }

/* Back face vertices (z=-50, rotated 180deg) */
.v-btl { top: -4px; right: -4px; transform: rotateY(180deg) translateZ(50px); }
.v-btr { top: -4px; left: -4px; transform: rotateY(180deg) translateZ(50px); }
.v-bbl { bottom: -4px; right: -4px; transform: rotateY(180deg) translateZ(50px); }
.v-bbr { bottom: -4px; left: -4px; transform: rotateY(180deg) translateZ(50px); }
</style>
