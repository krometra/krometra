<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useSelection } from "@/composables/shared/useSelection";
import { useSketch } from "@/composables/shared/useSketch";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { useApi } from "@/composables/useApi";
import { useAutoSave } from "@/composables/useAutoSave";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { useDocumentModel } from "@/composables/editor/useDocumentModel";
import { useBodyMeshes } from "@/composables/editor/useBodyMeshes";
import { useDocumentStatus } from "@/composables/editor/useDocumentStatus";
import { useCameraSync } from "@/composables/editor/useCameraSync";
import { useExtrudeRevolve } from "@/composables/editor/useExtrudeRevolve";
import { useSketchLifecycle } from "@/composables/editor/useSketchLifecycle";
import { useBooleanMode } from "@/composables/editor/useBooleanMode";
import { useFilletChamfer } from "@/composables/editor/useFilletChamfer";
import { useThread } from "@/composables/editor/useThread";
import { useEditorHotkeys } from "@/composables/editor/useEditorHotkeys";
import { useOnboarding } from "@/composables/editor/useOnboarding";
import { useExport } from "@/composables/editor/useExport";
import { useStepImport } from "@/composables/editor/useStepImport";
import { useProjectThumbnail } from "@/composables/editor/useProjectThumbnail";
import { useEditorControl } from "@/composables/editor/useEditorControl";
import { toast } from "@/composables/useToast";
import ViewportContainer from "@/components/viewport/ViewportContainer.vue";
import ViewCube from "@/components/viewport/ViewCube.vue";
import SketcherContainer from "@/components/sketcher/SketcherContainer.vue";
import PropertiesPanel from "@/components/properties/PropertiesPanel.vue";
import EditorMenuBar from "@/components/editor/EditorMenuBar.vue";
import EditorRibbon from "@/components/editor/EditorRibbon.vue";
import ModelTree from "@/components/editor/ModelTree.vue";
import TreeContextMenu from "@/components/editor/TreeContextMenu.vue";
import TimelineStrip from "@/components/editor/TimelineStrip.vue";
import EditorStatusBar from "@/components/editor/EditorStatusBar.vue";
import SketchPropsPanel from "@/components/editor/SketchPropsPanel.vue";
import ExtrudeRevolvePanel from "@/components/editor/ExtrudeRevolvePanel.vue";
import BooleanPanel from "@/components/editor/BooleanPanel.vue";
import FilletChamferPanel from "@/components/editor/FilletChamferPanel.vue";
import ThreadPanel from "@/components/editor/ThreadPanel.vue";
import ViewportControls from "@/components/editor/ViewportControls.vue";
import OnboardingHint from "@/components/editor/OnboardingHint.vue";
import ShortcutsDialog from "@/components/editor/ShortcutsDialog.vue";
import AxisTriad from "@/components/editor/AxisTriad.vue";
import LegacyProjectNotice from "@/components/editor/LegacyProjectNotice.vue";
import { pluralize } from "@/lib/plural";
import type { CtxItem, RenderingMode, RibbonAction, SelectionMode, TreeItemKind } from "@/composables/editor/types";
import type { BrepTopo, Project } from "@/types/api";

const props = defineProps<{ id: string }>();

const api = useApi();
const documentStore = useDocument();
const selection = useSelection();
const sketch = useSketch();
const undoRedo = useUndoRedo();
const names = useDisplayNames();
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
const extrude = useExtrudeRevolve({ projectId: props.id, viewportRef, meshes, model });
const sketchFlow = useSketchLifecycle({
  projectId: props.id,
  viewportRef,
  sketcherRef,
  viewportSelectionMode,
  meshes,
  model,
  extrude,
});
const booleanMode = useBooleanMode({ projectId: props.id, viewportRef, viewportSelectionMode, meshes });
const filletChamfer = useFilletChamfer({ projectId: props.id, viewportRef, viewportSelectionMode, meshes });
const thread = useThread({ projectId: props.id, viewportRef, viewportSelectionMode, meshes });
const projectName = ref("Проект");
const exportApi = useExport({ projectName, bodies: model.bodies });
const stepImport = useStepImport({ projectId: props.id, viewportRef, meshes });
useProjectThumbnail({ projectId: props.id, viewportRef, visibleBodies: meshes.totalBodies, legacyProject: meshes.legacyProject });

const { start: startAutoSave } = useAutoSave(props.id, 30000);

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
  startAutoSave();
});

// --- Режимы: эскиз выходит из остальных, между собой они не пересекаются ---

function leaveActiveTools() {
  if (filletChamfer.filletChamferMode.value) filletChamfer.exit();
  if (thread.threadMode.value) thread.exit();
  if (booleanMode.booleanMode.value) booleanMode.exit();
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
  if (action === "boolean") booleanMode.enter();
  else if (action === "fillet" || action === "chamfer") filletChamfer.enter(action);
  else if (action === "thread") thread.enter();
  else extrude.startExtrudeFromRibbon(action);
}

// --- События вьюпорта ---

function onFaceSelected(payload: { bodyId: string; faceId: string | number; brepTopo: BrepTopo }) {
  if (sketchFlow.facePickMode.value) {
    sketchFlow.handleFaceSketchStart(payload);
    return;
  }
  if (thread.threadMode.value) {
    thread.onFaceSelected(payload);
    return;
  }
  if (extrude.pickExtentFace(payload)) return;
  selection.selectFace(payload.bodyId, payload.faceId, payload.brepTopo);
}

function onSelectionCleared() {
  thread.onSelectionCleared();
  selection.clearSelection();
}

async function toggleBodyVisibility(bodyId: string) {
  const doc = documentStore.document.value;
  if (!doc) return;
  const comp = doc.components[bodyId] as Record<string, unknown> | undefined;
  if (!comp) return;
  const nowVisible = comp.visible === false;
  documentStore.document.value = {
    ...doc,
    components: { ...doc.components, [bodyId]: { ...comp, visible: nowVisible } },
  };
  viewportRef.value?.setMeshVisibility(bodyId, nowVisible);
  documentStore.markDirty();
  await documentStore.save(props.id);
}

// --- Контекстное меню дерева и таймлайна ---

const ctxMenu = ref<{ x: number; y: number; kind: TreeItemKind; id: string } | null>(null);

function openContextMenu(e: MouseEvent, kind: TreeItemKind, id: string) {
  ctxMenu.value = { x: e.clientX, y: e.clientY, kind, id };
}

function closeContextMenu() {
  ctxMenu.value = null;
}

const ctxItems = computed<CtxItem[]>(() => {
  const m = ctxMenu.value;
  if (!m) return [];
  if (m.kind === "sketch") {
    const items: CtxItem[] = [
      { label: "Редактировать эскиз", action: () => sketchFlow.editSketch(m.id) },
      { label: "Выдавить", action: () => extrude.startExtrudeFromSketch(m.id, "extrude") },
      { label: "Вращать", action: () => extrude.startExtrudeFromSketch(m.id, "revolve") },
      { label: "Переименовать", action: () => treeRef.value?.startRename(m.id, names.sketchLabel(m.id)) },
    ];
    if (!model.sketchHasFeature(m.id)) {
      items.push({ label: "Удалить", danger: true, action: () => sketchFlow.deleteSketch(m.id) });
    }
    return items;
  }
  if (m.kind === "body") {
    const body = model.bodies.value.find((b) => b.id === m.id);
    return [
      {
        label: body?.visible !== false ? "Скрыть" : "Показать",
        action: () => toggleBodyVisibility(m.id),
      },
      { label: "Переименовать", action: () => treeRef.value?.startRename(m.id, names.bodyLabel(m.id)) },
    ];
  }
  const entry = model.timelineEntries.value.find((e) => e.id === m.id);
  const items: CtxItem[] = [
    { label: "Показать свойства", action: () => selection.selectFeature(m.id) },
  ];
  if (entry?.kind === "sketch" && entry.sketch_id) {
    const sketchId = entry.sketch_id;
    items.push({ label: "Редактировать эскиз", action: () => sketchFlow.editSketch(sketchId) });
  }
  if (entry) {
    items.push({ label: "Переименовать", action: () => treeRef.value?.startRename(m.id, names.entryLabel(entry)) });
  }
  return items;
});

// --- Undo / Redo ---

// В эскизе Ctrl+Z правит эскиз, а не историю фич модели: раньше он проваливался
// в CommandHistory и откатывал ПРЕДЫДУЩУЮ операцию модели вместо линии эскиза.
async function handleUndo() {
  if (sketch.sketchMode.value) {
    if (!(await sketch.undo())) toast("Отменять нечего", "info");
    return;
  }
  if (!undoRedo.canUndo.value) {
    toast("Отменять нечего", "info");
    return;
  }
  await undoRedo.undo();
  await refreshAfterHistoryChange();
}

async function handleRedo() {
  if (sketch.sketchMode.value) {
    if (!(await sketch.redo())) toast("Повторять нечего", "info");
    return;
  }
  if (!undoRedo.canRedo.value) {
    toast("Повторять нечего", "info");
    return;
  }
  await undoRedo.redo();
  await refreshAfterHistoryChange();
}

// Undo/redo уже записали своё состояние на сервер, поэтому markDirty здесь
// НЕЛЬЗЯ: автосейв затем перезаписывал бы документ устаревшим снимком из
// памяти — из-за этого после перезагрузки модель откатывалась к ранней версии.
// Сцена перестраивается из документа, а не точечными мутациями (AGENTS.md).
async function refreshAfterHistoryChange() {
  await documentStore.load(props.id);
  await meshes.hydrateBodyMeshes();
}

useEditorControl({
  projectId: props.id, viewportRef, sketcherRef, model, meshes, extrude, sketchFlow, booleanMode, filletChamfer, thread,
  exportApi, stepImport, leaveActiveTools, undo: handleUndo, redo: handleRedo,
});

// --- Горячие клавиши ---

function handleEscape() {
  if (ctxMenu.value) {
    closeContextMenu();
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
  if (filletChamfer.filletChamferMode.value) {
    filletChamfer.exit();
    return;
  }
  if (thread.threadMode.value) {
    thread.exit();
    return;
  }
  if (booleanMode.booleanMode.value) {
    booleanMode.exit();
    return;
  }
  if (extrude.lastSavedSketchId.value) {
    extrude.clearSketchContext();
    return;
  }
  selection.clearSelection();
  viewportRef.value?.clearHighlight();
}

const showShortcuts = ref(false);

useEditorHotkeys({
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
});

// --- Вспомогательные вычисления для оверлеев ---

const busyLabel = computed(() => {
  if (extrude.extrudeLoading.value) return "Выдавливание…";
  if (extrude.revolveLoading.value) return "Вращение…";
  if (filletChamfer.loading.value) return "Построение…";
  if (thread.loading.value) return "Нарезка резьбы…";
  if (booleanMode.loading.value) return "Булева операция…";
  return null;
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
      filletChamfer.filletChamferMode.value ||
      thread.threadMode.value ||
      booleanMode.booleanMode.value,
  ),
});

function runOnboardingStep(step: "sketch" | "extrude" | "refine") {
  if (step === "sketch") enterSketchMode();
  else if (step === "extrude") handleRibbonAction("extrude");
  else handleRibbonAction("fillet");
}

const selectionLabel = computed(() => {
  const s = selection.selection.value;
  if (!s) return "ничего не выбрано";
  if (s.type === "face") {
    return `выбрано: ${names.bodyLabel(s.bodyId)} / грань #${s.faceId}`;
  }
  if (s.type === "edge") {
    return `выбрано: ${names.bodyLabel(s.bodyId)} / ребро #${s.edgeId}`;
  }
  return `выбрано: ${names.bodyLabel(s.bodyId)} / вершина #${s.vertexId}`;
});
</script>

<template>
  <div :class="$style.editor">
    <EditorMenuBar
      :project-name="projectName"
      :doc-status="status.docStatus.value"
      :status-label="status.statusLabel.value"
      :doc-version="status.docVersion.value"
      :export-loading="exportApi.loading.value"
      :export-error="exportApi.error.value"
      :import-loading="stepImport.loading.value"
      @reload="status.handleReload"
      @export-stl="exportApi.downloadStl"
      @export-step="exportApi.downloadStep"
      @import-step="stepImport.pickFile"
    />

    <EditorRibbon
      :can-undo="sketch.sketchMode.value ? sketch.canUndo.value : undoRedo.canUndo.value"
      :can-redo="sketch.sketchMode.value ? sketch.canRedo.value : undoRedo.canRedo.value"
      :body-count="model.bodies.value.length"
      @action="handleRibbonAction"
      @undo="handleUndo"
      @redo="handleRedo"
      @show-shortcuts="showShortcuts = true"
    />

    <div :class="$style.middle">
      <ModelTree
        ref="treeRef"
        :project-id="props.id"
        @context-menu="openContextMenu"
        @toggle-visibility="toggleBodyVisibility"
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
          @body-selected="booleanMode.handleBodySelected"
          @body-deselected="booleanMode.handleBodyDeselected"
          @edge-selection-changed="filletChamfer.onEdgeSelectionChanged"
        />

        <div v-if="sketchFlow.facePickMode.value" :class="$style.facePickBanner">
          <span>Кликните базовую плоскость или плоскую грань тела</span>
          <span v-if="sketchFlow.facePickError.value" :class="$style.facePickError">{{ sketchFlow.facePickError.value }}</span>
          <button :class="$style.cancelBtn" @click="sketchFlow.cancelFacePick">Отмена (Esc)</button>
        </div>

        <OnboardingHint
          v-if="onboarding.hint.value"
          :hint="onboarding.hint.value"
          @act="runOnboardingStep(onboarding.hint.value.step)"
          @dismiss="onboarding.dismiss(onboarding.hint.value.step)"
        />

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
          @fit-all="viewportRef?.fitAllBodies()"
        />

        <div v-if="!sketch.sketchMode.value" :class="$style.readout">
          <div>
            {{ pluralize(visibleBodyCount, "тело", "тела", "тел") }} ·
            {{ pluralize(meshes.totalFaces.value, "грань", "грани", "граней") }} ·
            {{ pluralize(meshes.totalEdges.value, "ребро", "ребра", "рёбер") }}
          </div>
          <div :class="$style.readoutSel">{{ selectionLabel }}</div>
        </div>
      </div>

      <aside :class="$style.props">
        <SketchPropsPanel
          v-if="sketch.sketchMode.value"
          @ok="sketchFlow.handleSketchOk"
          @cancel="sketchFlow.handleSketchCancel"
        />
        <ExtrudeRevolvePanel
          v-else-if="extrude.lastSavedSketchId.value"
          :extrude="extrude"
        />
        <FilletChamferPanel
          v-else-if="filletChamfer.filletChamferMode.value"
          :fillet="filletChamfer"
        />
        <ThreadPanel
          v-else-if="thread.threadMode.value"
          :thread="thread"
        />
        <BooleanPanel
          v-else-if="booleanMode.booleanMode.value"
          :boolean="booleanMode"
        />
        <PropertiesPanel
          v-else
          @edit-sketch="sketchFlow.editSketch"
          @rebuilt="meshes.refreshMesh($event.bodyId, $event.mesh)"
        />
      </aside>
    </div>

    <TimelineStrip
      :entries="model.timelineEntries.value"
      :selected-id="selection.selectedFeatureId.value"
      @select="selection.selectFeature($event)"
      @context-menu="(e, id) => openContextMenu(e, 'feature', id)"
      @add-sketch="enterSketchMode()"
    />

    <EditorStatusBar
      :last-op-ms="extrude.lastOpMs.value"
      :operation-count="model.timelineEntries.value.length"
    />

    <ShortcutsDialog v-model:open="showShortcuts" />
    <LegacyProjectNotice v-if="meshes.legacyProject.value" />

    <TreeContextMenu
      v-if="ctxMenu"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :items="ctxItems"
      @close="closeContextMenu"
    />
  </div>
</template>

<style module>
.editor {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--cs-surface);
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

.facePickBanner {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 90%;
  padding: 10px 16px;
  background: var(--cs-surface-raised, #252535);
  border: 1px solid var(--cs-primary, #4a7dff);
  border-radius: 10px;
  color: var(--cs-text, #eee);
  font-size: 13px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.facePickError {
  color: var(--cs-error, oklch(0.65 0.2 25));
  font-size: 12px;
}

.cancelBtn {
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--cs-border-strong);
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 7px;
  color: oklch(0.80 0.005 250);
  transition: border-color var(--cs-transition-fast);
}

.cancelBtn:hover {
  border-color: var(--cs-text-muted);
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
  background: var(--cs-surface-raised, #252535);
  border: 1px solid var(--cs-border-strong);
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--cs-text);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}

.busySpinner {
  width: 13px;
  height: 13px;
  border: 2px solid var(--cs-border-strong);
  border-top-color: var(--cs-primary);
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
  font-family: var(--cs-font-mono);
  font-size: 11px;
  color: var(--cs-text-secondary);
  line-height: 1.7;
}

.readoutSel {
  color: var(--cs-amber);
}

.props {
  width: 298px;
  flex-shrink: 0;
  border-left: 1px solid var(--cs-border-subtle);
  background: var(--cs-surface-alt);
  display: flex;
  flex-direction: column;
}
</style>
