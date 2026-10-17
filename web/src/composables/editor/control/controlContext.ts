import type { Ref } from "vue";
import { until } from "@vueuse/core";
import { useDocument } from "@/composables/shared/useDocument";
import { useSelection } from "@/composables/shared/useSelection";
import { useSketch } from "@/composables/shared/useSketch";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { useDisplayNames } from "@/composables/useDisplayNames";
import type SketcherContainer from "@/components/sketcher/SketcherContainer.vue";
import { resolveEditorMode, type EditorMode } from "@/lib/control/mode";
import { entryError, isRolledBack, isSuppressed } from "@/lib/timelineFlags";
import { fail } from "@/lib/control/protocol";
import type { MeshData, TimelineEntry } from "@/types/api";
import { useBrowserKernelStatus } from "../browserKernelStatus";
import type { BodyMeshesApi } from "../useBodyMeshes";
import type { BodyPresentationApi } from "../useBodyPresentation";
import type { BodyTransformApi } from "../useBodyTransform";
import type { BooleanModeApi } from "../useBooleanMode";
import type { useDocumentModel } from "../useDocumentModel";
import type { ExportApi } from "../useExport";
import type { ExtrudeRevolveApi } from "../useExtrudeRevolve";
import type { FilletChamferApi } from "../useFilletChamfer";
import type { MirrorApi } from "../useMirror";
import type { HoleApi } from "../useHole";
import type { ModelHistoryApi } from "../useModelHistory";
import type { PatternApi } from "../usePattern";
import type { SketchLifecycleApi } from "../useSketchLifecycle";
import type { StepImportApi } from "../useStepImport";
import type { SweepApi } from "../useSweep";
import type { LoftApi } from "../useLoft";
import type { ThreadApi } from "../useThread";
import type { ShellApi } from "../useShell";
import type { MeasureApi } from "../useMeasure";
import type { ViewportRef } from "../types";

export interface EditorControlDeps {
  projectId: string;
  viewportRef: ViewportRef;
  sketcherRef: Ref<InstanceType<typeof SketcherContainer> | null>;
  model: ReturnType<typeof useDocumentModel>;
  meshes: BodyMeshesApi;
  extrude: ExtrudeRevolveApi;
  sketchFlow: SketchLifecycleApi;
  booleanMode: BooleanModeApi;
  filletChamfer: FilletChamferApi;
  thread: ThreadApi;
  mirror: MirrorApi;
  sweep: SweepApi;
  loft: LoftApi;
  hole: HoleApi;
  pattern: PatternApi;
  exportApi: ExportApi;
  stepImport: StepImportApi;
  history: ModelHistoryApi;
  bodyPresentation: BodyPresentationApi;
  bodyTransform: BodyTransformApi;
  leaveActiveTools: () => void;
  shell: ShellApi;
  measure: MeasureApi;
}

const KERNEL_WAITING: Record<string, string> = {
  idle: "Браузерное ядро ещё не запущено.",
  loading: "Браузерное ядро загружается.",
  restarting: "Браузерное ядро перезапускается.",
};

export function createControlContext(deps: EditorControlDeps) {
  const documentStore = useDocument();
  const selection = useSelection();
  const sketch = useSketch();
  const undoRedo = useUndoRedo();
  const names = useDisplayNames();
  const kernel = useBrowserKernelStatus();

  function mode(): EditorMode {
    return resolveEditorMode({
      sketch: sketch.sketchMode.value,
      planePick: deps.sketchFlow.facePickMode.value,
      sweepPanel: deps.extrude.lastSavedSketchId.value ? deps.extrude.panelMode.value : null,
      edgeFeature: deps.filletChamfer.filletChamferMode.value ? deps.filletChamfer.mode.value : null,
      thread: deps.thread.threadMode.value,
      shell: deps.shell.shellMode.value,
      mirror: deps.mirror.mirrorMode.value,
      hole: deps.hole.holeMode.value,
      pattern: deps.pattern.patternMode.value,
      boolean: deps.booleanMode.booleanMode.value,
      sweep: deps.sweep.sweepMode.value,
      loft: deps.loft.loftMode.value,
      measure: deps.measure.active.value,
    });
  }

  function notReadyReason(): string | null {
    if (!deps.viewportRef.value) return "Вьюпорт редактора ещё не смонтирован.";
    if (documentStore.document.value?.project_id !== deps.projectId) return "Документ проекта ещё не загружен.";
    if (!deps.meshes.hydrated.value) return "Тела проекта ещё загружаются в сцену и ядро.";
    const phase = kernel.phase.value;
    if (phase === "failed") return `Браузерное ядро не запустилось: ${kernel.failure.value ?? "причина неизвестна"}`;
    return phase === "ready" ? null : KERNEL_WAITING[phase];
  }

  function busyReason(): string | null {
    if (deps.extrude.extrudeLoading.value) return "Идёт выдавливание.";
    if (deps.extrude.revolveLoading.value) return "Идёт вращение.";
    if (deps.filletChamfer.loading.value) return "Идёт построение скругления или фаски.";
    if (deps.thread.loading.value) return "Идёт нарезка резьбы.";
    if (deps.shell.loading.value) return "Идёт построение оболочки.";
    if (deps.mirror.loading.value) return "Идёт зеркальное отражение тела.";
    if (deps.hole.loading.value) return "Идёт сверление отверстий.";
    if (deps.booleanMode.loading.value) return "Идёт булева операция.";
    if (deps.sweep.loading.value) return "Идёт протяжка по траектории.";
    if (deps.loft.loading.value) return "Идёт построение лофта.";
    if (deps.stepImport.loading.value) return "Идёт импорт STEP.";
    if (deps.bodyTransform.loading.value) return "Идёт перемещение тела.";
    if (deps.pattern.loading.value) return "Идёт построение массива.";
    if (undoRedo.isExecuting.value) return "Идёт отмена или повтор операции.";
    if (deps.sketchFlow.finishing.value || sketch.isLoading.value) return "Эскиз сохраняется или загружается.";
    if (deps.meshes.hydrating.value) return "Тела перезагружаются в сцену.";
    if (documentStore.isLoading.value) return "Документ сохраняется или загружается.";
    return null;
  }

  function viewport() {
    const instance = deps.viewportRef.value;
    if (!instance) throw fail("not_ready", "Вьюпорт редактора ещё не смонтирован.");
    return instance;
  }

  function leaveTools() {
    if (sketch.sketchMode.value) {
      throw fail("wrong_mode", "Открыт эскиз: сначала завершите его (sketch.finish) или отмените (sketch.cancel).");
    }
    deps.leaveActiveTools();
  }

  function requireSketchMode(): string {
    const sketchId = sketch.activeSketchId.value;
    if (!sketch.sketchMode.value || !sketchId) {
      throw fail("wrong_mode", `Операция доступна только в режиме эскиза, сейчас режим «${mode()}».`);
    }
    return sketchId;
  }

  function bodyMesh(bodyId: string): MeshData {
    const mesh = deps.meshes.meshBodies.value.find((body) => body.body_id === bodyId)?.mesh;
    if (!mesh) throw fail("not_found", `Тело «${bodyId}» не найдено среди загруженных тел. Список тел — op "state".`);
    return mesh;
  }

  function bodyFace(bodyId: string, faceId: string) {
    const mesh = bodyMesh(bodyId);
    const face = mesh.brep_topo.faces.find((candidate) => String(candidate.face_id) === faceId);
    if (!face) throw fail("not_found", `У тела «${bodyId}» нет грани «${faceId}». Список граней — op "topology".`);
    return { mesh, faceId: face.face_id };
  }

  function requireSketch(sketchId: string) {
    if (!deps.model.sketches.value.some((candidate) => candidate.id === sketchId)) {
      throw fail("not_found", `Эскиз «${sketchId}» не найден в документе. Список эскизов — op "state".`);
    }
  }

  function timelineEntry(entry: TimelineEntry) {
    return {
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      name: names.entryLabel(entry),
      status: entry.status,
      error: entryError(entry),
      suppressed: isSuppressed(entry),
      rolledBack: isRolledBack(entry),
      params: entry.params ?? {},
      sketchId: entry.sketch_id ?? null,
      bodyId: entry.result_body_id ?? entry.body_id ?? null,
    };
  }

  async function waitFor(condition: () => boolean, timeoutMs: number, timeoutMessage: string) {
    try {
      await until(condition).toBe(true, { timeout: timeoutMs, throwOnTimeout: true });
    } catch {
      throw fail("operation_failed", timeoutMessage);
    }
  }

  return {
    ...deps,
    documentStore,
    selection,
    sketch,
    undoRedo,
    names,
    kernel,
    mode,
    notReadyReason,
    busyReason,
    viewport,
    leaveTools,
    requireSketchMode,
    bodyMesh,
    bodyFace,
    requireSketch,
    timelineEntry,
    waitFor,
  };
}

export type EditorControlContext = ReturnType<typeof createControlContext>;
