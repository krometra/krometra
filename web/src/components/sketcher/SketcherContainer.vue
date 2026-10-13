<script setup lang="ts">
// SketcherContainer — оркестратор 2D-эскиза.
// Состояние доменов живёт в composables/sketcher, разметка — в дочерних
// компонентах; здесь только связывание и обработка кликов по канве.

import { computed, ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import type { SketchPlane, SketchData, SketchEntity, SketchPoint } from "@/types/api";
import type { SketchTool as SketchToolName } from "@/composables/shared/useSketch";
import SketchCanvas from "./SketchCanvas.vue";
import SketcherToolbar from "./SketcherToolbar.vue";
import ConstraintToolbar from "./ConstraintToolbar.vue";
import ValueInputOverlay from "./ValueInputOverlay.vue";
import LiveDimensionsOverlay from "./LiveDimensionsOverlay.vue";
import { isConstruction, isPointNearEntity } from "@/sketcher/geometry";
import { useSketchEntities } from "@/composables/sketcher/useSketchEntities";
import { useSketchSnapping } from "@/composables/sketcher/useSketchSnapping";
import { useAuxLines } from "@/composables/sketcher/useAuxLines";
import { useLiveDimensions } from "@/composables/sketcher/useLiveDimensions";
import { useEdgeDrag } from "@/composables/sketcher/useEdgeDrag";
import { useSketchConstraints } from "@/composables/sketcher/useSketchConstraints";
import { LineTool } from "./tools/LineTool";
import { RectangleTool } from "./tools/RectangleTool";
import { CircleTool } from "./tools/CircleTool";
import { ArcTool } from "./tools/ArcTool";
import type { SketchTool, SketchToolContext } from "./tools/SketchTool";
import { cancelToolStep } from "./tools/cancelToolStep";

const PICK_PX = 10;

const props = defineProps<{
  plane: SketchPlane;
  active: boolean;
  tool: SketchToolName;
}>();

const emit = defineEmits<{
  (e: "sketch-changed", data: { entities: SketchEntity[]; constraints: SketchData["constraints"] }): void;
  (e: "tool-change", tool: SketchToolName): void;
}>();

const sketchCanvasRef = ref<InstanceType<typeof SketchCanvas> | null>(null);
const liveDimsRef = ref<InstanceType<typeof LiveDimensionsOverlay> | null>(null);

const tools: Record<string, SketchTool> = {
  line: new LineTool(),
  rectangle: new RectangleTool(),
  circle: new CircleTool(),
  arc: new ArcTool(),
};
const rectangleTool = tools.rectangle as RectangleTool;
const circleTool = tools.circle as CircleTool;

const toolRef = computed(() => props.tool);
const isSelectTool = computed(() => props.tool === "select");
const currentTool = computed(() => tools[props.tool] ?? tools.line);

const preview = ref<SketchEntity | null>(null);
const hoveredEntityId = ref<string | null>(null);

function selectTool(t: SketchToolName) {
  emit("tool-change", t);
}

function zoom(): number {
  return sketchCanvasRef.value?.getZoom() ?? 1;
}

function canvasRect(): DOMRect | undefined {
  return sketchCanvasRef.value?.getCanvasEl()?.getBoundingClientRect();
}

function screenToWorld(sx: number, sy: number): SketchPoint {
  return sketchCanvasRef.value?.screenToWorld(sx, sy) ?? { x: 0, y: 0 };
}

function pixelsToWorld(px: number): number {
  return px / zoom();
}

const sketch = useSketchEntities((payload) => emit("sketch-changed", payload));

const snapping = useSketchSnapping({
  entities: sketch.entities,
  zoom,
  screenToWorld,
});

const aux = useAuxLines({
  tool: toolRef,
  entities: sketch.entities,
  zoom,
  canvasRect,
  nextEntityId: sketch.nextEntityId,
  addEntities: sketch.addEntities,
  emitChanged: sketch.emitChanged,
});

const liveDimensions = useLiveDimensions({
  tool: toolRef,
  rectangleTool,
  circleTool,
  canvasRect,
  inputs: () => liveDimsRef.value?.inputs ?? [],
});

const edgeDrag = useEdgeDrag({
  entities: sketch.entities,
  zoom,
  screenToWorld,
  emitChanged: sketch.emitChanged,
  toggleSelection: sketch.toggleSelection,
});

const constraints = useSketchConstraints({
  entities: sketch.entities,
  selectedEntityIds: sketch.selectedEntityIds,
  nextConstraintId: sketch.nextConstraintId,
  addConstraint: sketch.addConstraint,
  clearSelection: sketch.clearSelection,
  solveAndApply: sketch.solveAndApply,
  canvasRect,
});

const auxHint = computed(() => {
  if (!aux.isAuxTool.value) return null;
  if (aux.auxPhase.value === "pick-base") return "Укажите базовую линию";
  if (aux.auxPhase.value !== "place") return null;
  return props.tool === "aux-parallel"
    ? `Отступ ${aux.auxDistance.value} мм — кликните сторону`
    : "Укажите точку";
});

function toolContext(): SketchToolContext {
  return {
    screenToWorld: (sx, sy) => snapping.snappedScreenToWorld(
      sx,
      sy,
      currentTool.value === circleTool ? circleTool.getCenter() : null,
    ),
    nextId: sketch.nextEntityId,
    pixelsToWorld,
  };
}

function updatePreview() {
  preview.value = aux.isAuxTool.value ? aux.previewEntity() : currentTool.value.getPreview();
}

function findEntityAt(world: SketchPoint): SketchEntity | null {
  const threshold = PICK_PX / zoom();
  for (let i = sketch.entities.value.length - 1; i >= 0; i--) {
    const entity = sketch.entities.value[i];
    if (isConstruction(entity)) continue;
    if (isPointNearEntity(world, entity, threshold)) return entity;
  }
  return null;
}

function pickOrDrag(world: SketchPoint): boolean {
  const hit = findEntityAt(world);
  if (!hit) {
    sketch.clearSelection();
    return false;
  }
  if (hit.type === "line" && !hit.construction) edgeDrag.start(hit, world);
  else sketch.toggleSelection(hit.id);
  return true;
}

function onCanvasClick(screenX: number, screenY: number) {
  const world = screenToWorld(screenX, screenY);

  if (aux.isAuxTool.value) {
    aux.handleClick(aux.auxPhase.value === "place" ? snapping.snapWorld(world) : world);
    updatePreview();
    return;
  }

  if (isSelectTool.value) {
    snapping.clearSnap();
    pickOrDrag(world);
    return;
  }

  const tool = currentTool.value;

  // Only allow selection/drag when tool is idle (not mid-draw).
  // A click on a snap point starts drawing from it instead of selecting/dragging.
  if (!tool.isActive()) {
    snapping.snapWorld(world);
    if (snapping.snapPoint.value === null && pickOrDrag(world)) {
      updatePreview();
      return;
    }
  }

  tool.onMouseDown(screenX, screenY, toolContext());
  if (currentTool.value.isActive() && !liveDimensions.liveDims.value) {
    liveDimensions.open(screenX, screenY);
  }
  updatePreview();
}

function onCanvasMove(screenX: number, screenY: number) {
  if (edgeDrag.isDragging()) {
    edgeDrag.update(screenX, screenY);
    return;
  }

  if (isSelectTool.value) {
    detectHover(screenX, screenY);
    return;
  }

  if (aux.isAuxTool.value) {
    if (aux.auxPhase.value === "place") {
      aux.auxMouse.value = snapping.snapWorld(screenToWorld(screenX, screenY));
    } else {
      aux.auxMouse.value = screenToWorld(screenX, screenY);
      snapping.clearSnap();
    }
    updatePreview();
    detectHover(screenX, screenY);
    return;
  }

  // Привязку считаем на КАЖДОМ движении, независимо от фазы инструмента:
  // LineTool/RectangleTool/CircleTool до первого клика выходят по
  // `if (this.drawing)`, поэтому маркера под курсором не было вовсе, и
  // пользователь не знал, куда встанет точка (ROADMAP, Фаза C).
  snapping.snapWorld(screenToWorld(screenX, screenY));
  currentTool.value.onMouseMove(screenX, screenY, toolContext());
  updatePreview();
  liveDimensions.updateReadout();
  detectHover(screenX, screenY);
}

function detectHover(screenX: number, screenY: number) {
  const world = screenToWorld(screenX, screenY);
  const threshold = PICK_PX / zoom();

  for (let i = sketch.entities.value.length - 1; i >= 0; i--) {
    const entity = sketch.entities.value[i];
    if (isPointNearEntity(world, entity, threshold)) {
      hoveredEntityId.value = entity.id;
      return;
    }
  }
  hoveredEntityId.value = null;
}

function applyProduced(
  tool: SketchTool,
  produced: SketchEntity | SketchEntity[] | null,
  context: SketchToolContext
) {
  if (produced) {
    sketch.addEntities(Array.isArray(produced) ? produced : [produced]);

    if (tool.detectConstraints) {
      // Без emit: одно действие пользователя — одно событие и один шаг
      // истории. Иначе прямоугольник давал 8 записей, и Ctrl+Z «не кончался».
      for (const c of tool.detectConstraints(context, sketch.entities.value)) {
        sketch.addConstraint(c, { silent: true });
      }
    }

    sketch.emitChanged();
    liveDimensions.close();
  }
  updatePreview();
}

function onGlobalMouseUp(e: MouseEvent) {
  if (!props.active || !sketchCanvasRef.value) return;

  if (edgeDrag.isDragging()) {
    edgeDrag.finish();
    updatePreview();
    return;
  }

  if (aux.isAuxTool.value || isSelectTool.value) return;

  const target = e.target as HTMLElement | null;
  if (target?.closest?.("[data-sketch-ui]")) return;

  const rect = canvasRect();
  if (!rect) return;

  const context = toolContext();
  const tool = currentTool.value;
  applyProduced(tool, tool.onMouseUp(e.clientX - rect.left, e.clientY - rect.top, context), context);
  // Клик по канве уводит фокус с поля размеров — возвращаем его,
  // чтобы значение можно было вводить сразу после первого клика.
  if (liveDimensions.liveDims.value) liveDimensions.focusFirstInput();
}

function applyLiveDims() {
  liveDimensions.applyOverrides();
  updatePreview();
  liveDimensions.updateReadout();
}

function commitLiveDims() {
  const tool = currentTool.value;
  if (!tool.isActive()) return;
  const context = toolContext();
  applyProduced(tool, tool.onMouseUp(0, 0, context), context);
}

function cancelLiveDims() {
  currentTool.value.reset();
  liveDimensions.close();
  updatePreview();
}

function resetInteraction() {
  Object.values(tools).forEach((t) => t.reset());
  preview.value = null;
  snapping.clearSnap();
  liveDimensions.close();
  edgeDrag.cancel();
  aux.reset();
}

watch(() => props.tool, resetInteraction, { immediate: true });

watch(
  () => props.active,
  (isActive) => {
    if (!isActive) resetInteraction();
  }
);

const HOTKEY_TOOLS: Record<string, SketchToolName> = {
  v: "select", м: "select",
  l: "line", д: "line",
  r: "rectangle", к: "rectangle",
  c: "circle", с: "circle",
  a: "arc", ф: "arc",
};

function onSketchKeyDown(e: KeyboardEvent) {
  if (!props.active) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;

  if (e.key === "Escape") {
    e.preventDefault();
    if (cancelToolStep(currentTool.value)) {
      liveDimensions.close();
      snapping.clearSnap();
      updatePreview();
      return;
    }
    if (edgeDrag.isDragging()) {
      edgeDrag.cancel();
      return;
    }
    if (aux.isAuxTool.value) {
      aux.reset();
      snapping.clearSnap();
      updatePreview();
      return;
    }
    sketch.clearSelection();
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    sketch.removeSelected();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const toolName = HOTKEY_TOOLS[e.key.toLowerCase()];
  if (toolName) {
    e.preventDefault();
    selectTool(toolName);
  }
}

onMounted(() => {
  window.addEventListener("mouseup", onGlobalMouseUp);
  window.addEventListener("keydown", onSketchKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("mouseup", onGlobalMouseUp);
  window.removeEventListener("keydown", onSketchKeyDown);
});

function loadSketch(data: SketchData) {
  sketch.load(data);
  nextTick(() => sketchCanvasRef.value?.fitToView(sketch.entities.value));
}

defineExpose({
  loadSketch,
  getCanvas: () => sketchCanvasRef.value,
});
</script>

<template>
  <div v-if="active" :class="$style.container">
    <SketcherToolbar
      :tool="tool"
      :can-undo="sketch.sketchStore.canUndo.value"
      :can-redo="sketch.sketchStore.canRedo.value"
      :snap-enabled="snapping.snapEnabled.value"
      :aux-hint="auxHint"
      @select-tool="selectTool"
      @undo="sketch.sketchStore.undo()"
      @redo="sketch.sketchStore.redo()"
      @toggle-snap="snapping.snapEnabled.value = !snapping.snapEnabled.value"
    />

    <ConstraintToolbar
      v-if="sketch.selectedEntityIds.value.length > 0"
      :selected-count="sketch.selectedEntityIds.value.length"
      :constraint-types="constraints.constraintTypes"
      :can-apply="constraints.canApply"
      :label="constraints.label"
      :title="constraints.title"
      @apply="constraints.create"
      @clear="sketch.clearSelection()"
    />

    <ValueInputOverlay
      v-if="constraints.dimensionalInput.value?.visible"
      v-model="constraints.dimensionalInput.value.value"
      :x="constraints.dimensionalInput.value.x"
      :y="constraints.dimensionalInput.value.y"
      :placeholder="constraints.dimensionalInput.value.type === 'radius' ? 'Радиус' : constraints.dimensionalInput.value.type === 'angle' ? 'Угол (°)' : 'Расстояние'"
      @confirm="constraints.confirmDimensional"
      @cancel="constraints.cancelDimensional"
    />

    <ValueInputOverlay
      v-if="aux.auxDistanceInput.value?.visible"
      v-model="aux.auxDistanceInput.value.value"
      :x="aux.auxDistanceInput.value.x"
      :y="aux.auxDistanceInput.value.y"
      placeholder="Отступ, мм"
      @confirm="aux.confirmDistance"
      @cancel="aux.cancelDistance"
    />

    <LiveDimensionsOverlay
      v-if="liveDimensions.liveDims.value"
      ref="liveDimsRef"
      :x="liveDimensions.liveDims.value.x"
      :y="liveDimensions.liveDims.value.y"
      :fields="liveDimensions.liveDims.value.fields"
      @input="applyLiveDims"
      @next-field="liveDimensions.focusNextInput"
      @commit="commitLiveDims"
      @cancel="cancelLiveDims"
    />

    <SketchCanvas
      ref="sketchCanvasRef"
      :entities="sketch.entities.value"
      :preview="preview"
      :hovered-entity-id="hoveredEntityId"
      :constraints="sketch.constraints.value"
      :selected-entity-ids="sketch.selectedEntityIds.value"
      :snap-point="snapping.snapPoint.value"
      :snap-label="snapping.snapHint.value?.label ?? null"
      @canvas-click="onCanvasClick"
      @canvas-move="onCanvasMove"
    />
  </div>
</template>

<style module>
.container {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  z-index: 10;
}
</style>
