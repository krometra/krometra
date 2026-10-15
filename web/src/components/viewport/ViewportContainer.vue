<script setup lang="ts">
// ViewportContainer — оркестратор 3D-вьюпорта.
// Логика доменов живёт в composables/viewport/: сцена и камера, реестр тел,
// выбор тела/грани/ребра, хелперы плоскостей, контуры эскизов, превью операций.
// Здесь только связывание: props/emits, маршрутизация событий мыши, экспорт API.

import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import * as THREE from "three";
import type { MeshData, SketchEntity } from "@/types/api";
import type { MeshEntry, RenderingMode, SelectionMode, SketchFrame } from "@/composables/viewport/types";
import { useSceneCore } from "@/composables/viewport/useSceneCore";
import { useBodyRegistry } from "@/composables/viewport/useBodyRegistry";
import { useBodySelection } from "@/composables/viewport/useBodySelection";
import { useFaceSelection } from "@/composables/viewport/useFaceSelection";
import { useEdgeSelection } from "@/composables/viewport/useEdgeSelection";
import { usePlaneHelpers } from "@/composables/viewport/usePlaneHelpers";
import { useSketchOutlines } from "@/composables/viewport/useSketchOutlines";
import { usePreviews } from "@/composables/viewport/usePreviews";
import { useMirrorPreview } from "@/composables/viewport/useMirrorPreview";
import { useViewportProbe } from "@/composables/viewport/useViewportProbe";
import { useSectionView } from "@/composables/viewport/useSectionView";
import { useCameraLookAt } from "@/composables/viewport/useCameraLookAt";
import { bodyFaceFrame, visibleBounds } from "@/composables/viewport/bodyGeometry";
import { raycastFace } from "@/composables/viewport/faceRaycast";

export type { SketchFrame } from "@/composables/viewport/types";

const props = defineProps<{
  selectionMode?: SelectionMode;
  renderingMode?: RenderingMode;
}>();

const emit = defineEmits<{
  faceSelected: [payload: { bodyId: string; faceId: string | number; brepTopo: import("@/types/api").BrepTopo }];
  selectionCleared: [];
  bodySelected: [payload: { bodyId: string }];
  bodyDeselected: [payload: { bodyId: string }];
  edgeSelectionChanged: [snapshot: import("@/composables/viewport/useEdgeSelection").EdgeSelectionSnapshot];
  planePicked: [payload: { plane: import("@/types/api").SketchPlane }];
  faceContextMenu: [payload: { bodyId: string; faceId: string | number; x: number; y: number }];
}>();

const RENDERING_MODE_LABELS: Record<RenderingMode, string> = {
  shaded: "Заливка",
  shaded_edges: "Заливка с рёбрами",
  wireframe: "Каркас",
  hidden_line: "Видимые рёбра",
};

const canvasContainer = ref<HTMLDivElement>();
const renderingMode = ref<RenderingMode>(props.renderingMode ?? "shaded");
const renderingModeLabel = computed(() => RENDERING_MODE_LABELS[renderingMode.value]);
const selectionMode = computed<SelectionMode>(() => props.selectionMode ?? "face");

const entries: MeshEntry[] = [];
const core = useSceneCore(entries);
const { context } = core;

const planes = usePlaneHelpers(context);
const outlines = useSketchOutlines(core.sketchGroup);
const previews = usePreviews(context);
const mirrorPreview = useMirrorPreview(context);
const probe = useViewportProbe(context);
const section = useSectionView(context);
const lookAt = useCameraLookAt(context, core.animateCameraTo);

const faces = useFaceSelection({
  context,
  onSelected: (payload) => emit("faceSelected", payload),
  onCleared: () => emit("selectionCleared"),
});

const edges = useEdgeSelection({
  context,
  onChanged: (snapshot) => emit("edgeSelectionChanged", snapshot),
});

const bodies = useBodySelection({
  context,
  onSelected: (bodyId) => emit("bodySelected", { bodyId }),
  onDeselected: (bodyId) => emit("bodyDeselected", { bodyId }),
  onCleared: () => emit("selectionCleared"),
});

const registry = useBodyRegistry({
  entries,
  meshGroup: core.meshGroup,
  shadedEdgesGroup: core.shadedEdgesGroup,
  renderingMode: () => renderingMode.value,
  fitCameraToSphere: core.fitCameraToSphere,
  onMeshAdded: (entry) => {
    faces.adopt(entry);
    section.adopt(entry);
  },
  onMeshRemoved: (entry) => {
    edges.forget(entry);
    faces.forget(entry);
    bodies.forget(entry.bodyId);
  },
});

onMounted(() => {
  if (!canvasContainer.value) return;
  core.init(canvasContainer.value, { onClick: onCanvasClick, onMove: onCanvasMouseMove, onContextMenu: onCanvasContextMenu });
  context.scene().add(planes.group);
});

onUnmounted(() => {
  section.dispose();
  core.dispose();
  registry.clearAll();
  outlines.clearAll();
  // Призраки живут вне реестра тел: без этого уход из редактора с открытой
  // панелью операции оставлял их геометрию и материалы в GPU-памяти.
  previews.hideExtrude();
  previews.hideFillet();
  previews.hideThread();
});

function onCanvasClick(event: MouseEvent) {
  if (!context.ready()) return;
  core.updatePointer(event);

  // Хелпер базовой плоскости забирает клик только мимо тел (lib/pickPriority)
  const quad = planes.pick();
  if (quad) {
    emit("planePicked", { plane: planes.planeOf(quad) });
    return;
  }

  if (selectionMode.value === "body") bodies.handleClick();
  else if (selectionMode.value === "face") faces.handleClick();
  else if (selectionMode.value === "edge") edges.handleClick();
}

function onCanvasMouseMove(event: MouseEvent) {
  if (!context.ready()) return;
  core.updatePointer(event);

  if (selectionMode.value === "edge") {
    core.setCursor(edges.handleHover() ? "pointer" : "crosshair");
    return;
  }
  if (selectionMode.value !== "face" && !planes.isVisible()) return;

  const quad = planes.pick();
  planes.setHovered(quad);
  const faceHovered = quad ? (faces.restoreSelected(), false) : faces.handleHover();

  core.setCursor(quad || faceHovered ? "pointer" : idleCursor());
}

function onCanvasContextMenu(event: MouseEvent) {
  if (!context.ready()) return;
  core.updatePointer(event);
  const found = raycastFace(context);
  if (found) emit("faceContextMenu", { bodyId: found.entry.bodyId, faceId: found.faceId, x: event.clientX, y: event.clientY });
}

function idleCursor(): string {
  if (planes.isVisible()) return "crosshair";
  return selectionMode.value === "edge" || selectionMode.value === "body" ? "crosshair" : "";
}

function fitAllBodies() {
  const visibleEntries = entries.filter((e) => e.visible);
  const sketchGroups = outlines.groups();
  if (visibleEntries.length === 0 && sketchGroups.size === 0) {
    core.resetView();
    return;
  }

  // Кадр задают тела; контуры эскизов учитываются, только когда тел нет —
  // иначе далёкий эскиз отдалил бы камеру от модели
  const box = new THREE.Box3();
  for (const entry of visibleEntries) box.expandByObject(entry.mesh);
  if (visibleEntries.length === 0) {
    for (const group of sketchGroups.values()) box.expandByObject(group);
  }

  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  core.fitCameraToSphere(sphere);
}

function clearAllBodies() {
  bodies.clear();
  faces.clearSelection();
  edges.clearAllEdgeLines();
  registry.clearAll();
}

function addMesh(meshData: MeshData, bodyId = "body-1", visible = true, color: string | null = null) {
  registry.addMesh(meshData, bodyId, visible, color);
}

function addSketchOutline(sketchId: string, entities_: SketchEntity[], frame: SketchFrame = {}) {
  outlines.add(sketchId, entities_, frame);
}

watch(
  () => props.renderingMode,
  (mode) => {
    renderingMode.value = mode ?? "shaded";
    registry.applyRenderingMode(renderingMode.value);
  },
);

watch(
  () => props.selectionMode,
  (mode) => {
    if (mode === "edge") edges.ensureAll();
    else {
      edges.clearHover();
      core.setCursor("");
    }
  },
);

defineExpose({
  getCameraState: core.getCameraState,
  captureImage: (width: number, height: number) => section.unclipped(() => core.captureImage(width, height)),
  projectPoints: probe.projectPoints,
  inspectScene: probe.inspectScene,
  setCameraView: core.setCameraView,
  setHelpersVisible: core.setHelpersVisible,
  animateCameraTo: core.animateCameraTo,
  lookAt: lookAt.lookAt,
  lookAtFace: lookAt.lookAtFace,
  faceFrame: (bodyId: string, faceId: string | number) => bodyFaceFrame(entries, bodyId, faceId),
  modelBounds: () => visibleBounds(entries),
  setSection: section.apply,
  clearSection: section.clear,
  getSection: section.snapshot,
  addMesh,
  removeMesh: registry.removeMesh,
  setMeshVisibility: registry.setMeshVisibility,
  setMeshColor: registry.setMeshColor,
  isolateBodies: registry.isolate,
  addSketchOutline,
  removeSketchOutline: outlines.remove,
  clearAllSketchOutlines: outlines.clearAll,
  showPlaneHelpers: planes.show,
  hidePlaneHelpers: () => {
    planes.hide();
    core.setCursor("");
  },
  showExtrudePreview: previews.showExtrude,
  hideExtrudePreview: previews.hideExtrude,
  showFilletPreview: previews.showFillet,
  hideFilletPreview: previews.hideFillet,
  showThreadPreview: previews.showThread,
  hideThreadPreview: previews.hideThread,
  showMirrorPreview: mirrorPreview.show,
  hideMirrorPreview: mirrorPreview.hide,
  fitAllBodies,
  resetView: core.resetView,
  getBodyIds: registry.getBodyIds,
  getSelectedBodyIds: bodies.getSelected,
  selectBodyAsTarget: bodies.selectAsTarget,
  selectBodyAsTool: bodies.selectAsTool,
  highlightFace: faces.highlightFace,
  markFaces: faces.markFaces,
  clearMarkedFaces: faces.clearMarkedFaces,
  selectEdge: edges.selectById,
  clearEdgeSelection: edges.clearSelection,
  toggleEdge: edges.toggleEdge,
  setEdgeChain: edges.setChain,
  highlightEdges: edges.highlight,
  clearEdgeHighlight: edges.clearHover,
  getSelectedEdges: edges.getSelected,
  getHoveredEdge: edges.getHovered,
  getHighlightedEdges: edges.getHighlighted,
  clearAllEdgeLines: edges.clearAllEdgeLines,
  clearHighlight: faces.clearSelection,
  clearBodySelection: bodies.clear,
  clearAllBodies,
  getRenderingMode: () => renderingMode.value,
});
</script>

<template>
  <div ref="canvasContainer" :class="$style.viewport">
    <div :class="$style.modeIndicator">
      <span :class="$style.modeLabel">{{ renderingModeLabel }}</span>
    </div>

    <div v-if="selectionMode === 'body'" :class="$style.selectionModeBadge">
      Выбор тела
    </div>
    <div v-else-if="selectionMode === 'edge'" :class="$style.selectionModeBadge">
      Выбор рёбер
    </div>
  </div>
</template>

<style module>
.viewport {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--cs-surface);
}

.viewport :deep(canvas) {
  display: block;
}

.modeIndicator {
  position: absolute;
  top: var(--cs-spacing-md);
  left: var(--cs-spacing-md);
  z-index: 10;
}

.modeLabel {
  padding: var(--cs-spacing-xs) var(--cs-spacing-sm);
  background: var(--cs-surface-raised);
  border: 1px solid var(--cs-border);
  border-radius: var(--cs-radius-sm);
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
}

.selectionModeBadge {
  position: absolute;
  top: var(--cs-spacing-md);
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  padding: 4px 12px;
  background: var(--cs-primary-soft);
  border: 1px solid var(--cs-primary-border);
  border-radius: var(--cs-radius-sm);
  color: var(--cs-primary-active);
  font-size: var(--cs-font-size-xs);
  font-weight: var(--cs-font-weight-bold);
}
</style>
