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
import DimensionInputOverlay from "./DimensionInputOverlay.vue";
import { marksOfTargets } from "@/sketcher/selectionMarks";
import { useSketchEntities } from "@/composables/sketcher/useSketchEntities";
import { useSketchSnapping } from "@/composables/sketcher/useSketchSnapping";
import { useAuxLines } from "@/composables/sketcher/useAuxLines";
import { useLiveDimensions } from "@/composables/sketcher/useLiveDimensions";
import { useEdgeDrag } from "@/composables/sketcher/useEdgeDrag";
import { useSketchConstraints } from "@/composables/sketcher/useSketchConstraints";
import { useSketchDimensions } from "@/composables/sketcher/useSketchDimensions";
import { useSketchPicking } from "@/composables/sketcher/useSketchPicking";
import { LineTool } from "./tools/LineTool";
import { RectangleTool } from "./tools/RectangleTool";
import { CircleTool } from "./tools/CircleTool";
import { ArcTool } from "./tools/ArcTool";
import { ThreePointArcTool } from "./tools/ThreePointArcTool";
import type { SketchTool, SketchToolContext } from "./tools/SketchTool";
import { cancelToolStep } from "./tools/cancelToolStep";

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
  arc3: new ThreePointArcTool(),
};
const rectangleTool = tools.rectangle as RectangleTool;
const circleTool = tools.circle as CircleTool;

const toolRef = computed(() => props.tool);
const isSelectTool = computed(() => props.tool === "select");
const isDimensionTool = computed(() => props.tool === "dimension");
const currentTool = computed(() => tools[props.tool] ?? tools.line);

const preview = ref<SketchEntity | null>(null);
const toolStepHint = ref<string | null>(null);

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
  toggleSelection: (entityId) => sketch.selection.toggle({ kind: "entity", entityId }),
});

const picking = useSketchPicking({ entities: sketch.entities, zoom, selection: sketch.selection, edgeDrag });

const dimensions = useSketchDimensions({ sketch, zoom, screenToWorld, canvasRect });
const dimension = dimensions.tool;
const dimensionInput = dimensions.input;

const constraints = useSketchConstraints({
  selectionTargets: sketch.selection.targets,
  nextConstraintId: sketch.nextConstraintId,
  addConstraint: sketch.addConstraint,
  clearSelection: sketch.clearSelection,
  solveAndApply: sketch.solveAndApply,
  openDimension: dimensions.openFromToolbar,
});

const highlightedIds = computed(() => [...sketch.selection.entityIds.value, ...dimension.highlightedIds.value]);
const canvasSnap = computed(() => {
  if (isDimensionTool.value) return dimension.marker.value;
  if (isSelectTool.value) return picking.hoveredPoint.value;
  return snapping.snapPoint.value && { at: snapping.snapPoint.value, label: snapping.snapHint.value?.label ?? null };
});
const selectionMarks = computed(() =>
  marksOfTargets(
    [...sketch.selection.targets(), ...dimension.targets.value],
    isDimensionTool.value ? dimension.hovered.value : picking.hoveredTarget.value,
  ),
);

const auxHint = computed(() => {
  if (isDimensionTool.value) return dimension.hint.value;
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
  toolStepHint.value = aux.isAuxTool.value ? null : currentTool.value.hint?.() ?? null;
}

function clickHitsLabel(screenX: number, screenY: number): boolean {
  if (aux.isAuxTool.value) return false;
  const drawing = !isSelectTool.value && !isDimensionTool.value && currentTool.value.isActive();
  return !drawing && dimensions.labelAt(screenX, screenY) !== null;
}

function onCanvasClick(screenX: number, screenY: number) {
  const world = screenToWorld(screenX, screenY);
  dimensionInput.cancel();
  if (clickHitsLabel(screenX, screenY)) return;

  if (isDimensionTool.value) {
    dimension.onClick(screenX, screenY);
    return;
  }

  if (aux.isAuxTool.value) {
    aux.handleClick(aux.auxPhase.value === "place" ? snapping.snapWorld(world) : world);
    updatePreview();
    return;
  }

  if (isSelectTool.value) {
    snapping.clearSnap();
    picking.selectAt(world);
    return;
  }

  const tool = currentTool.value;

  // Only allow selection/drag when tool is idle (not mid-draw).
  // A click on a snap point starts drawing from it instead of selecting/dragging.
  if (!tool.isActive()) {
    snapping.snapWorld(world);
    if (snapping.snapPoint.value === null && picking.selectDrawableAt(world)) {
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
    picking.hoverItemAt(screenToWorld(screenX, screenY));
    return;
  }

  if (isDimensionTool.value) {
    dimension.onMove(screenX, screenY);
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
  picking.hoverEntityAt(screenToWorld(screenX, screenY));
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

  if (aux.isAuxTool.value || isSelectTool.value || isDimensionTool.value) return;

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
  toolStepHint.value = currentTool.value.hint?.() ?? null;
  snapping.clearSnap();
  picking.clearHover();
  liveDimensions.close();
  edgeDrag.cancel();
  aux.reset();
  dimensions.reset();
}

watch(() => props.tool, resetInteraction, { immediate: true });
watch(isDimensionTool, (active) => active && dimensions.startFromSelection());

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
  d: "dimension", в: "dimension",
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
    if (dimension.isPicking()) {
      dimension.reset();
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
  selection: sketch.selection,
});
</script>

<template>
  <div v-if="active" :class="$style.container">
    <SketcherToolbar
      :tool="tool"
      :can-undo="sketch.sketchStore.canUndo.value"
      :can-redo="sketch.sketchStore.canRedo.value"
      :snap-enabled="snapping.snapEnabled.value"
      :aux-hint="auxHint ?? toolStepHint"
      @select-tool="selectTool"
      @undo="sketch.sketchStore.undo()"
      @redo="sketch.sketchStore.redo()"
      @toggle-snap="snapping.snapEnabled.value = !snapping.snapEnabled.value"
    />

    <ConstraintToolbar
      v-if="sketch.selection.count.value > 0"
      :selected-count="sketch.selection.count.value"
      :constraint-types="constraints.constraintTypes"
      :can-apply="constraints.canApply"
      :label="constraints.label"
      :title="constraints.title"
      @apply="constraints.create"
      @clear="sketch.clearSelection()"
    />

    <DimensionInputOverlay
      v-if="dimensionInput.state.value"
      :x="dimensionInput.state.value.x"
      :y="dimensionInput.state.value.y"
      :title="dimensionInput.state.value.title"
      :text="dimensionInput.state.value.field.text.value"
      :error="dimensionInput.state.value.field.error.value"
      @update:text="dimensionInput.type"
      @confirm="dimensionInput.confirm"
      @cancel="dimensionInput.cancel"
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
      :hovered-entity-id="picking.hoveredEntityId.value"
      :constraints="sketch.constraints.value"
      :selected-entity-ids="highlightedIds"
      :snap-point="canvasSnap?.at ?? null"
      :snap-label="canvasSnap?.label ?? null"
      :marks="selectionMarks"
      @canvas-click="onCanvasClick"
      @canvas-dblclick="dimensions.editAt"
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
