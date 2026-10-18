<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useSelection } from "@/composables/shared/useSelection";
import { useSketch } from "@/composables/shared/useSketch";
import { useApi } from "@/composables/useApi";
import { useAutoSave } from "@/composables/useAutoSave";
import { useDocumentModel } from "@/composables/editor/useDocumentModel";
import { useBodyMeshes } from "@/composables/editor/useBodyMeshes";
import { useDocumentStatus } from "@/composables/editor/useDocumentStatus";
import { useCameraSync } from "@/composables/editor/useCameraSync";
import { useExtrudeRevolve } from "@/composables/editor/useExtrudeRevolve";
import { useSketchLifecycle } from "@/composables/editor/useSketchLifecycle";
import { useBooleanMode } from "@/composables/editor/useBooleanMode";
import { useFilletChamfer } from "@/composables/editor/useFilletChamfer";
import { useThread } from "@/composables/editor/useThread";
import { useShell } from "@/composables/editor/useShell";
import { useDraft } from "@/composables/editor/useDraft";
import { useMirror } from "@/composables/editor/useMirror";
import { useEditorTools } from "@/composables/editor/useEditorTools";
import { useSelectionLabel } from "@/composables/editor/useSelectionLabel";
import { useSweep } from "@/composables/editor/useSweep";
import { useLoft } from "@/composables/editor/useLoft";
import { useHole } from "@/composables/editor/useHole";
import { useMeasure } from "@/composables/editor/useMeasure";
import { usePattern } from "@/composables/editor/usePattern";
import { usePressPull } from "@/composables/editor/usePressPull";
import { useEditorHotkeys } from "@/composables/editor/useEditorHotkeys";
import { useOnboarding } from "@/composables/editor/useOnboarding";
import { useExport } from "@/composables/editor/useExport";
import { useStepImport } from "@/composables/editor/useStepImport";
import { useModelHistory, type HistoryDirection } from "@/composables/editor/useModelHistory";
import { useBodyPresentation } from "@/composables/editor/useBodyPresentation";
import { useBodyTransform } from "@/composables/editor/useBodyTransform";
import { useDocumentWatch } from "@/composables/editor/useDocumentWatch";
import { useTreeContextMenu } from "@/composables/editor/useTreeContextMenu";
import { useTimelineEdits } from "@/composables/editor/useTimelineEdits";
import { useProjectThumbnail } from "@/composables/editor/useProjectThumbnail";
import { useEditorControl } from "@/composables/editor/useEditorControl";
import { useViewInspect } from "@/composables/editor/useViewInspect";
import { useWorkPlanes } from "@/composables/editor/useWorkPlanes";
import { apiErrorMessage, toast } from "@/composables/useToast";
import ViewportContainer from "@/components/viewport/ViewportContainer.vue";
import ViewCube from "@/components/viewport/ViewCube.vue";
import SketcherContainer from "@/components/sketcher/SketcherContainer.vue";
import EditorMenuBar from "@/components/editor/EditorMenuBar.vue";
import EditorOperationPanels from "@/components/editor/EditorOperationPanels.vue";
import EditorRibbon from "@/components/editor/EditorRibbon.vue";
import ModelTree from "@/components/editor/ModelTree.vue";
import TreeContextMenu from "@/components/editor/TreeContextMenu.vue";
import TimelineStrip from "@/components/editor/TimelineStrip.vue";
import SketchDeleteDialog from "@/components/editor/SketchDeleteDialog.vue";
import EditorStatusBar from "@/components/editor/EditorStatusBar.vue";
import ViewportControls from "@/components/editor/ViewportControls.vue";
import OnboardingHint from "@/components/editor/OnboardingHint.vue";
import ShortcutsDialog from "@/components/editor/ShortcutsDialog.vue";
import MeshExportDialog from "@/components/editor/MeshExportDialog.vue";
import AxisTriad from "@/components/editor/AxisTriad.vue";
import LegacyProjectNotice from "@/components/editor/LegacyProjectNotice.vue";
import WatchModeBanner from "@/components/editor/WatchModeBanner.vue";
import AiControlBadge from "@/components/editor/AiControlBadge.vue";
import ViewInspectOverlay from "@/components/editor/ViewInspectOverlay.vue";
import SketchPlanePickBanner from "@/components/editor/SketchPlanePickBanner.vue";
import WorkPlaneDeleteDialog from "@/components/editor/WorkPlaneDeleteDialog.vue";
import { pluralize } from "@/lib/plural";
import type { RenderingMode, RibbonAction, SelectionMode } from "@/composables/editor/types";
import type { BrepTopo, Project } from "@/types/api";

const props = defineProps<{ id: string; watch?: boolean }>();

const api = useApi();
const documentStore = useDocument();
const selection = useSelection();
const sketch = useSketch();
const model = useDocumentModel();

const viewportRef = ref<InstanceType<typeof ViewportContainer>>();
const sketcherRef = ref<InstanceType<typeof SketcherContainer> | null>(null);
const treeRef = ref<InstanceType<typeof ModelTree> | null>(null);

const viewportSelectionMode = ref<SelectionMode>("face");
const viewportRenderingMode = ref<RenderingMode>("shaded");

const meshes = useBodyMeshes({
  projectId: props.id,
  viewportRef,
  bodies: model.bodies,
  sketches: model.sketches,
});
const status = useDocumentStatus(props.id);
const camera = useCameraSync(viewportRef);
const inspect = useViewInspect(viewportRef);
const extrude = useExtrudeRevolve({ projectId: props.id, viewportRef, meshes, model });
const history = useModelHistory({ projectId: props.id, meshes });
const bodyPresentation = useBodyPresentation({ projectId: props.id, viewportRef });
const bodyTransform = useBodyTransform({ projectId: props.id, meshes });
const sketchFlow = useSketchLifecycle({
  projectId: props.id,
  viewportRef,
  sketcherRef,
  viewportSelectionMode,
  meshes,
  model,
  extrude,
  history,
});
const booleanMode = useBooleanMode({ projectId: props.id, viewportRef, viewportSelectionMode, meshes });
const filletChamfer = useFilletChamfer({ projectId: props.id, viewportRef, viewportSelectionMode, meshes });
const thread = useThread({ projectId: props.id, viewportRef, viewportSelectionMode, meshes });
const shell = useShell({ projectId: props.id, viewportRef, viewportSelectionMode, meshes });
const draft = useDraft({ projectId: props.id, viewportRef, viewportSelectionMode, meshes });
const mirror = useMirror({ projectId: props.id, viewportRef, viewportSelectionMode, meshes });
const sweep = useSweep({ projectId: props.id, meshes, model });
const loft = useLoft({ projectId: props.id, viewportRef, meshes, model });
const hole = useHole({ projectId: props.id, viewportRef, viewportSelectionMode, meshes, model });
const measure = useMeasure({ viewportRef, viewportSelectionMode, meshes });
const pattern = usePattern({ projectId: props.id, viewportRef, viewportSelectionMode, meshes });
const pressPull = usePressPull({ projectId: props.id, viewportRef, viewportSelectionMode, meshes });
const workPlanes = useWorkPlanes({ viewportRef, viewportSelectionMode, meshes, model, history, bodyPresentation, sketchFlow, leaveActiveTools });
const tools = useEditorTools([
  filletChamfer.tool, thread.tool, shell.tool, mirror.tool, booleanMode.tool, sweep.tool, loft.tool, hole.tool, measure.tool, pattern.tool, draft.tool,
  pressPull.tool, workPlanes.tool,
]);
const projectName = ref("Проект");
const exportApi = useExport({ projectName, bodies: model.bodies });
const stepImport = useStepImport({ projectId: props.id, viewportRef, meshes });
useProjectThumbnail({ projectId: props.id, viewportRef, visibleBodies: meshes.totalBodies, legacyProject: meshes.legacyProject });

const { start: startAutoSave } = useAutoSave(props.id, 30000);
const documentWatch = useDocumentWatch({ projectId: props.id, meshes });
const watchInert = props.watch ? true : undefined;

onMounted(async () => {
  status.docStatus.value = "loading";
  api.get<Project>(`/projects/${props.id}`)
    .then((p) => {
      projectName.value = p.name;
    })
    .catch(() => {});
  try {
    await documentStore.load(props.id);
    status.docStatus.value = "saved";
    await meshes.hydrateBodyMeshes();
  } catch {
    status.docStatus.value = "unsaved";
  }
  if (props.watch) documentWatch.start();
  else startAutoSave();
});

// --- Режимы: эскиз выходит из остальных, между собой они не пересекаются ---

function leaveActiveTools() {
  tools.leaveAll();
  if (sketchFlow.facePickMode.value) sketchFlow.cancelFacePick();
  if (extrude.lastSavedSketchId.value) extrude.clearSketchContext();
}

function enterSketchMode() {
  leaveActiveTools();
  sketchFlow.beginPlanePick();
}

function handleRibbonAction(action: RibbonAction) {
  if (action === "sketch") {
    enterSketchMode();
    return;
  }
  leaveActiveTools();
  if (action === "extrude" || action === "revolve") extrude.startExtrudeFromRibbon(action);
  else tools.enter(action);
}

// --- События вьюпорта ---

function onFaceSelected(payload: { bodyId: string; faceId: string | number; brepTopo: BrepTopo; point?: [number, number, number] }) {
  if (sketchFlow.facePickMode.value) {
    sketchFlow.handleFaceSketchStart(payload);
    return;
  }
  if (tools.onFaceSelected(payload)) return;
  if (extrude.pickFace(payload)) return;
  selection.selectFace(payload.bodyId, payload.faceId, payload.brepTopo);
}

function onSelectionCleared() {
  tools.onSelectionCleared();
  selection.clearSelection();
}

const timelineEdits = useTimelineEdits({ model, history });
const contextMenu = useTreeContextMenu({ tree: treeRef, model, sketchFlow, extrude, history, bodyPresentation, exportApi, timelineEdits, workPlanes });

// --- Undo / Redo ---

// В эскизе Ctrl+Z правит эскиз, а не историю фич модели: раньше он проваливался
// в CommandHistory и откатывал ПРЕДЫДУЩУЮ операцию модели вместо линии эскиза.
async function handleHistory(direction: HistoryDirection) {
  const nothing = direction === "undo" ? "Отменять нечего" : "Повторять нечего";
  if (sketch.sketchMode.value) {
    if (!(await (direction === "undo" ? sketch.undo() : sketch.redo()))) toast(nothing, "info");
    return;
  }
  try {
    if (!(await history.step(direction))) toast(nothing, "info");
  } catch (error) {
    toast(apiErrorMessage(error, "Не удалось изменить историю"), "warning");
  }
}

const handleUndo = () => handleHistory("undo");
const handleRedo = () => handleHistory("redo");

const control = props.watch
  ? null
  : useEditorControl({
      projectId: props.id, viewportRef, sketcherRef, model, meshes, extrude, sketchFlow, booleanMode, filletChamfer, thread, mirror, sweep, loft, hole, pattern,
      shell, exportApi, stepImport, history, bodyPresentation, bodyTransform, leaveActiveTools,
      measure, draft, pressPull, workPlanes,
    });

// --- Горячие клавиши ---

function handleEscape() {
  if (contextMenu.menu.value) {
    contextMenu.close();
    return;
  }
  if (treeRef.value?.isRenaming) {
    treeRef.value.cancelRename();
    return;
  }
  if (sketchFlow.facePickMode.value) {
    sketchFlow.cancelFacePick();
    return;
  }
  if (sketch.sketchMode.value) return; // инструменты скетчера обрабатывают Esc сами
  if (inspect.dismiss()) return;
  if (tools.exitActive()) return;
  if (extrude.lastSavedSketchId.value) {
    extrude.clearSketchContext();
    return;
  }
  selection.clearSelection();
  viewportRef.value?.clearHighlight();
}

const showShortcuts = ref(false);

if (!props.watch) useEditorHotkeys({
  onEscape: handleEscape,
  onUndo: handleUndo,
  onRedo: handleRedo,
  canRunTool: () => !sketch.sketchMode.value && !sketchFlow.facePickMode.value,
  onSketch: enterSketchMode,
  onExtrude: () => handleRibbonAction("extrude"),
  onRevolve: () => handleRibbonAction("revolve"),
  onFilletChamfer: () => handleRibbonAction("fillet"),
  onChamfer: () => handleRibbonAction("chamfer"),
  onToggleHelp: () => (showShortcuts.value = !showShortcuts.value),
  onDelete: () => timelineEdits.deleteSelected(),
});

// --- Вспомогательные вычисления для оверлеев ---

const busyLabel = computed(() => {
  if (extrude.extrudeLoading.value) return "Выдавливание…";
  if (extrude.revolveLoading.value) return "Вращение…";
  return tools.busyLabel.value;
});

const visibleBodyCount = meshes.totalBodies;

const onboarding = useOnboarding({
  model,
  loading: computed(() => status.docStatus.value === "loading"),
  busy: computed(
    () =>
      sketch.sketchMode.value ||
      sketchFlow.facePickMode.value ||
      extrude.lastSavedSketchId.value !== null ||
      tools.anyActive.value,
  ),
});

function runOnboardingStep(step: "sketch" | "extrude" | "refine") {
  if (step === "sketch") enterSketchMode();
  else if (step === "extrude") handleRibbonAction("extrude");
  else handleRibbonAction("fillet");
}

const selectionLabel = useSelectionLabel();
</script>

<template>
  <div :class="$style.editor">
    <EditorMenuBar
      :inert="watchInert"
      :project-name="projectName"
      :doc-status="status.docStatus.value"
      :status-label="status.statusLabel.value"
      :doc-version="status.docVersion.value"
      :export-loading="exportApi.loading.value"
      :export-error="exportApi.error.value"
      :import-loading="stepImport.loading.value"
      @reload="status.handleReload"
      @export-step="exportApi.downloadStep"
      @export-mesh="exportApi.openMeshExport"
      @import-step="stepImport.pickFile"
    />

    <EditorRibbon
      :inert="watchInert"
      :can-undo="sketch.sketchMode.value ? sketch.canUndo.value : history.canUndo.value"
      :can-redo="sketch.sketchMode.value ? sketch.canRedo.value : history.canRedo.value"
      :body-count="model.bodies.value.length"
      @action="handleRibbonAction"
      @undo="handleUndo"
      @redo="handleRedo"
      @show-shortcuts="showShortcuts = true"
    />

    <div :class="$style.middle">
      <ModelTree
        ref="treeRef"
        :inert="watchInert"
        :project-id="props.id"
        @context-menu="contextMenu.open"
        @toggle-visibility="contextMenu.toggleVisibility"
        @toggle-sketch-visibility="contextMenu.toggleSketchVisibility"
        @plane-context-menu="inspect.openPlaneMenu"
        @toggle-plane-visibility="workPlanes.toggleVisibility"
      />

      <div :class="$style.viewport">
        <ViewportContainer
          v-show="!sketch.sketchMode.value"
          ref="viewportRef"
          :selection-mode="viewportSelectionMode"
          :rendering-mode="viewportRenderingMode"
          @face-selected="onFaceSelected"
          @plane-picked="sketchFlow.onPlanePicked"
          @selection-cleared="onSelectionCleared"
          @body-picked="booleanMode.handleBodyPicked"
          @edge-selection-changed="filletChamfer.onEdgeSelectionChanged($event); pattern.onEdgeSelectionChanged($event)"
          @face-context-menu="inspect.openFaceMenu"
          @measure-picked="measure.onPicked($event); workPlanes.panel.onPicked($event)"
          @work-plane-picked="sketchFlow.onWorkPlanePicked"
        />

        <SketchPlanePickBanner v-if="sketchFlow.facePickMode.value" :error="sketchFlow.facePickError.value" @cancel="sketchFlow.cancelFacePick" />

        <OnboardingHint
          v-if="onboarding.hint.value && !props.watch && !control?.relay.attached.value"
          :hint="onboarding.hint.value"
          @act="runOnboardingStep(onboarding.hint.value.step)"
          @dismiss="onboarding.dismiss(onboarding.hint.value.step)"
        />

        <WatchModeBanner v-if="props.watch" :project-id="props.id" :last-synced-at="documentWatch.lastSyncedAt.value" />
        <AiControlBadge v-else-if="control?.relay.attached.value" />

        <div v-if="busyLabel" :class="$style.busyBadge">
          <span :class="$style.busySpinner" />{{ busyLabel }}
        </div>

        <SketcherContainer
          v-if="sketch.sketchMode.value"
          ref="sketcherRef"
          :plane="sketch.sketchPlane.value"
          :active="sketch.sketchMode.value"
          :tool="sketch.currentTool.value"
          @sketch-changed="sketchFlow.handleSketchChanged"
          @tool-change="sketch.setTool($event)"
        />

        <ViewCube
          v-if="!sketch.sketchMode.value"
          :camera-position="camera.cameraState.value.position"
          :camera-target="camera.cameraState.value.target"
          @view-change="camera.handleViewChange"
          @view-iso="camera.handleViewIso"
          @orbit="camera.handleOrbit"
        />

        <AxisTriad
          v-if="!sketch.sketchMode.value"
          :camera-position="camera.cameraState.value.position"
          :camera-target="camera.cameraState.value.target"
          :camera-up="camera.cameraState.value.up"
        />

        <ViewportControls
          v-if="!sketch.sketchMode.value"
          v-model:rendering-mode="viewportRenderingMode"
          :section-active="inspect.section.active.value"
          @fit-all="viewportRef?.fitAllBodies()"
          @look-at="inspect.lookAtSelection"
          @toggle-section="inspect.section.toggle"
        />
        <ViewInspectOverlay v-if="!sketch.sketchMode.value" :inspect="inspect" />

        <div v-if="!sketch.sketchMode.value" :class="$style.readout">
          <div>
            {{ pluralize(visibleBodyCount, "тело", "тела", "тел") }} ·
            {{ pluralize(meshes.totalFaces.value, "грань", "грани", "граней") }} ·
            {{ pluralize(meshes.totalEdges.value, "ребро", "ребра", "рёбер") }}
          </div>
          <div :class="$style.readoutSel">{{ selectionLabel }}</div>
        </div>
      </div>

      <aside :class="$style.props" :inert="watchInert">
        <EditorOperationPanels
          :panels="{ extrude, booleanMode, filletChamfer, thread, shell, draft, pressPull, mirror, sweep, loft, hole, measure, pattern, workPlanes }"
          @sketch-ok="sketchFlow.handleSketchOk"
          @sketch-cancel="sketchFlow.handleSketchCancel"
          @edit-sketch="sketchFlow.editSketch"
          @rebuilt="meshes.refreshMesh($event.bodyId, $event.mesh)"
        />
      </aside>
    </div>

    <TimelineStrip
      :inert="watchInert"
      :entries="model.timelineEntries.value"
      :selected-id="selection.selectedFeatureId.value"
      :marker="timelineEdits.marker.value"
      :lock-reason="timelineEdits.lockReason.value"
      @select="selection.selectFeature($event)"
      @rollback="timelineEdits.rollTo"
      @context-menu="(e, id) => contextMenu.open(e, 'feature', id)"
      @add-sketch="enterSketchMode()"
    />

    <EditorStatusBar
      :last-op-ms="extrude.lastOpMs.value"
      :operation-count="model.timelineEntries.value.length"
    />

    <ShortcutsDialog v-model:open="showShortcuts" />
    <MeshExportDialog :export-api="exportApi" />
    <SketchDeleteDialog :pending="timelineEdits.pendingSketchDelete.value" @confirm="timelineEdits.confirmSketchDelete" @cancel="timelineEdits.cancelSketchDelete" />
    <WorkPlaneDeleteDialog :pending="workPlanes.pendingDelete.value" @confirm="workPlanes.confirmRemove" @cancel="workPlanes.cancelRemove" />
    <LegacyProjectNotice v-if="meshes.legacyProject.value" />

    <TreeContextMenu
      v-if="contextMenu.menu.value"
      :x="contextMenu.menu.value.x"
      :y="contextMenu.menu.value.y"
      :items="contextMenu.items.value"
      @close="contextMenu.close"
    />
  </div>
</template>

<style module>
.editor {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--kr-surface);
}

.middle {
  flex: 1;
  display: flex;
  min-height: 0;
}

.viewport {
  flex: 1;
  position: relative;
  min-width: 0;
  overflow: hidden;
}

.busyBadge {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 16;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--kr-surface-raised, #252535);
  border: 1px solid var(--kr-border-strong);
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--kr-text);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}

.busySpinner {
  width: 13px;
  height: 13px;
  border: 2px solid var(--kr-border-strong);
  border-top-color: var(--kr-primary);
  border-radius: 50%;
  animation: busySpin 0.8s linear infinite;
}

@keyframes busySpin {
  to {
    transform: rotate(360deg);
  }
}

.readout {
  position: absolute;
  top: 44px;
  left: 16px;
  font-family: var(--kr-font-mono);
  font-size: 11px;
  color: var(--kr-text-secondary);
  line-height: 1.7;
}

.readoutSel {
  color: var(--kr-amber-strong);
}

.props {
  width: 298px;
  flex-shrink: 0;
  border-left: 1px solid var(--kr-border-subtle);
  background: var(--kr-surface-alt);
  display: flex;
  flex-direction: column;
}
</style>
