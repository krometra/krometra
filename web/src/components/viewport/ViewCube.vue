<script setup lang="ts">
/**
 * Interactive ViewCube — CSS 3D transform cube overlay for viewport.
 * - Renders a 3D cube with labeled faces (FRONT, BACK, TOP, BOTTOM, LEFT, RIGHT)
 * - Rotates synchronously with the camera to reflect current view angle
 * - Click face → animate camera to canonical view
 * - Click edge → intermediate isometric view
 * - Click vertex → isometric view
 * - Drag cube → orbit camera around current target
 * - Home button resets to default isometry
 */
import { computed, ref } from "vue";
import * as THREE from "three";
import KrIcon from "@/components/ui/KrIcon.vue";
import {
  CANONICAL_VIEWS,
  type CanonicalView,
} from "@/composables/useViewCube";
import { cubeRotation } from "@/lib/orientation";
import { beginCubeDrag, moveCubeDrag, type CubeDrag, type CubeOrbit } from "@/lib/navigation/cubeDrag";

const props = defineProps<{
  /** Current camera world position */
  cameraPosition: { x: number; y: number; z: number };
  /** Current orbit target (look-at point) */
  cameraTarget: { x: number; y: number; z: number };
}>();

const emit = defineEmits<{
  "view-change": [view: CanonicalView];
  "view-iso": [];
  orbit: [orbit: CubeOrbit];
}>();

const PRIMARY_BUTTON = 0;
let drag: CubeDrag | null = null;
let swallowClick = false;
const dragging = ref(false);

function onPointerDown(e: PointerEvent) {
  swallowClick = false;
  drag = e.button === PRIMARY_BUTTON ? beginCubeDrag(e.clientX, e.clientY) : null;
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return;
  if ((e.buttons & 1) === 0) {
    onPointerEnd();
    return;
  }
  const next = moveCubeDrag(drag, e.clientX, e.clientY);
  if (next.drag.dragging && !drag.dragging) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  drag = next.drag;
  dragging.value = drag.dragging;
  if (next.orbit) emit("orbit", next.orbit);
}

function onPointerEnd() {
  swallowClick = drag?.dragging ?? false;
  drag = null;
  dragging.value = false;
}


const rotation = computed(() =>
  cubeRotation(
    new THREE.Vector3(
      props.cameraPosition.x - props.cameraTarget.x,
      props.cameraPosition.y - props.cameraTarget.y,
      props.cameraPosition.z - props.cameraTarget.z,
    ),
  ),
);

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
  if (swallowClick) {
    swallowClick = false;
    return;
  }
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
      <KrIcon name="home" :size="14" />
    </button>

    <!-- 3D CSS Cube scene -->
    <div
      :class="[$style.scene, dragging && $style.sceneDragging]"
      data-testid="view-cube"
      @click="handleClick"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerEnd"
      @pointercancel="onPointerEnd"
    >
      <div
        :class="$style.cube"
        :style="{
          transform: `scale3d(0.8, 0.8, 0.8) rotateX(${rotation.rotateX}deg) rotateY(${rotation.rotateY}deg)`,
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
  border: 1px solid var(--kr-border-strong);
  background: oklch(1 0 0 / 0.90);
  color: var(--kr-text-secondary);
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  transition: all var(--kr-transition-fast);
}

.homeBtn:hover {
  background: var(--kr-primary-soft);
  color: var(--kr-text);
  border-color: var(--kr-primary);
}

/* 3D scene with perspective */
.scene {
  width: 136px;
  height: 136px;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 400px;
  cursor: pointer;
  touch-action: none;
  user-select: none;
}

.sceneDragging,
.sceneDragging * {
  cursor: grabbing;
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
  border: 1px solid var(--kr-border-strong);
  background: oklch(0.985 0.006 244);
  backface-visibility: hidden;
  transition: background var(--kr-transition-fast);
}

.face:hover {
  background: var(--kr-primary-soft);
}

.faceLabel {
  font-family: var(--kr-font-family);
  font-size: 13px;
  font-weight: var(--kr-font-weight-bold);
  letter-spacing: 0.04em;
  color: var(--kr-text);
  user-select: none;
  pointer-events: none;
}

.face:hover .faceLabel {
  color: var(--kr-primary-active);
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
  transition: background var(--kr-transition-fast);
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
  transition: background var(--kr-transition-fast);
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
