<script setup lang="ts">
// SketchCanvas — 2D-канва эскиза: связывает вид (pan/zoom) с модулями
// отрисовки. Сама геометрия и рисование живут в src/sketcher/.
import { ref, watch } from "vue";
import type { SketchEntity, SketchPoint, SketchConstraint } from "@/types/api";
import { useCanvasViewport } from "@/composables/sketcher/useCanvasViewport";
import {
  drawAxes,
  drawEntity,
  drawGrid,
  drawSelectionHalo,
  drawSnapMarker,
} from "@/sketcher/renderEntities";
import { drawConstraints } from "@/sketcher/renderConstraints";

const props = defineProps<{
  entities: SketchEntity[];
  preview: SketchEntity | null;
  hoveredEntityId: string | null;
  constraints?: SketchConstraint[];
  selectedEntityIds?: string[];
  snapPoint?: SketchPoint | null;
  snapLabel?: string | null;
}>();

const emit = defineEmits<{
  (e: "canvas-click", screenX: number, screenY: number): void;
  (e: "canvas-move", screenX: number, screenY: number): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

const viewport = useCanvasViewport({ canvasRef, containerRef, render });

function render() {
  const canvas = canvasRef.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  viewport.applyTransform(ctx);
  const view = viewport.viewParams();

  drawGrid(ctx, view);
  drawAxes(ctx, view);

  for (const entity of props.entities) {
    if (props.selectedEntityIds?.includes(entity.id)) drawSelectionHalo(ctx, view, entity);
    drawEntity(ctx, view, entity, entity.id === props.hoveredEntityId);
  }

  if (props.preview) drawEntity(ctx, view, props.preview, false, true);
  if (props.constraints?.length) {
    drawConstraints(ctx, view, props.constraints, props.entities);
  }
  if (props.snapPoint) drawSnapMarker(ctx, view, props.snapPoint, props.snapLabel);

  ctx.restore();
}

function onMouseDown(e: MouseEvent) {
  // Middle click or right click = pan
  if (e.button === 1 || e.button === 2) {
    e.preventDefault();
    viewport.startPan(e);
    return;
  }

  if (e.button === 0) {
    const pos = viewport.canvasPos(e);
    if (pos) emit("canvas-click", pos.x, pos.y);
  }
}

function onMouseMove(e: MouseEvent) {
  if (viewport.updatePan(e)) return;
  const pos = viewport.canvasPos(e);
  if (pos) emit("canvas-move", pos.x, pos.y);
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  viewport.zoomAt(e);
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
}

watch(
  () => [
    props.entities,
    props.preview,
    props.hoveredEntityId,
    props.constraints,
    props.selectedEntityIds,
    props.snapPoint,
    props.snapLabel,
  ],
  render,
  { deep: true }
);

defineExpose({
  screenToWorld: viewport.screenToWorld,
  worldToScreen: viewport.worldToScreen,
  fitToView: viewport.fitToView,
  render,
  getOffset: viewport.getOffset,
  getZoom: viewport.getZoom,
  getCanvasEl: () => canvasRef.value,
});
</script>

<template>
  <div ref="containerRef" :class="$style.container">
    <canvas
      ref="canvasRef"
      :class="$style.canvas"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="viewport.endPan()"
      @wheel="onWheel"
      @contextmenu="onContextMenu"
    />
  </div>
</template>

<style module>
.container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f8fafc;
}

.canvas {
  display: block;
  cursor: crosshair;
}
</style>
