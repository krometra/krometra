import { computed, onUnmounted, ref, watch } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useSelection } from "@/composables/shared/useSelection";
import { useSketch } from "@/composables/shared/useSketch";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { useParameters } from "@/composables/useParameters";
import { toast } from "@/composables/useToast";
import { liveBodyId } from "@/lib/browserBodySuccession";
import { evaluateExpression } from "@/lib/expr";
import type { ExtrudeOperation, PlaneBasis, SketchEntity, SketchPlane } from "@/types/api";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { useDocumentModel } from "./useDocumentModel";
import type { ViewportRef } from "./types";
import { useExtrudeExtent, type ExtrudeExtentSettings } from "./useExtrudeExtent";

export interface ExtrudeSettings extends ExtrudeExtentSettings {
  distance?: number;
  operation?: ExtrudeOperation;
  direction?: "one_side" | "symmetric" | "two_sided";
  reversed?: boolean;
  targetBodyId?: string | null;
}

export interface RevolveSettings {
  angle?: number;
  axis?: "x" | "y";
  axisOrigin?: { x: number; y: number };
  direction?: "one_side" | "symmetric";
}

export function useExtrudeRevolve(deps: {
  projectId: string;
  viewportRef: ViewportRef;
  meshes: BodyMeshesApi;
  model: ReturnType<typeof useDocumentModel>;
}) {
  const { projectId, viewportRef, meshes, model } = deps;
  const documentStore = useDocument();
  const selection = useSelection();
  const sketch = useSketch();
  const undoRedo = useUndoRedo();
  const paramsStore = useParameters();

  const lastSavedSketchId = ref<string | null>(null);
  const lastSavedSketchTargetId = ref<string | null>(null);
  // Панель одна на две операции; режим решает, какую из них показать.
  const panelMode = ref<"extrude" | "revolve">("extrude");
  const extrudeDistance = ref(30.0);
  const extrudeDistanceExpr = ref("30");
  const extrudeDistanceInvalid = ref(false);
  const extrudeDirection = ref<"one_side" | "symmetric" | "two_sided">("one_side");
  const extrudeReversed = ref(false);
  const extrudeOperation = ref<ExtrudeOperation>("new_body");
  const extrudeTargetBodyId = ref<string | null>(null);
  const extent = useExtrudeExtent(meshes);
  const extrudeLoading = ref(false);
  const extrudeError = ref<string | null>(null);

  const revolveAngle = ref(360.0);
  const revolveAxis = ref<"x" | "y">("y");
  const revolveAxisOrigin = ref({ x: 0, y: 0 });
  const revolveDirection = ref<"one_side" | "symmetric">("one_side");
  const revolveLoading = ref(false);
  const revolveError = ref<string | null>(null);

  const lastOpMs = ref<number | null>(null);
  let stopBrowserGeometry: (() => void) | null = null;

  onUnmounted(() => stopBrowserGeometry?.());

  function clearSketchContext() {
    lastSavedSketchId.value = null;
    lastSavedSketchTargetId.value = null;
    extrudeTargetBodyId.value = null;
    extrudeError.value = null;
    revolveError.value = null;
  }

  // Нормаль эскиза смотрит наружу тела, поэтому «Вырезать» с положительным
  // расстоянием уходило в воздух. Вырез по умолчанию идёт против нормали,
  // остальные операции — по ней; «Реверс» переворачивает любую из них.
  const extrudeAxisSign = computed(() => {
    const base = extrudeOperation.value === "cut" ? -1 : 1;
    return extrudeReversed.value ? -base : base;
  });

  const extrudeSignedDistance = computed(
    () => Math.abs(extrudeDistance.value) * extrudeAxisSign.value,
  );

  // --- Live ghost preview in the viewport ---
  const previewSketchData = computed(() => {
    if (!lastSavedSketchId.value) return null;
    return model.sketches.value.find((s) => s.id === lastSavedSketchId.value) ?? null;
  });

  const extrudeEffectiveTargetId = computed(
    () => lastSavedSketchTargetId.value ?? extrudeTargetBodyId.value,
  );

  function sketchPlacement(s: NonNullable<typeof previewSketchData.value>) {
    return {
      entities: (s.entities as SketchEntity[]) ?? [],
      plane: (s.plane as SketchPlane) ?? "XY",
      planeOffset: typeof s.plane_offset === "number" ? s.plane_offset : 0,
      planeBasis: (s.plane_basis as PlaneBasis | null) ?? null,
    };
  }

  function extrudeBase() {
    return {
      distance: extrudeSignedDistance.value,
      direction: extrudeDirection.value,
      operation: extrudeOperation.value,
      targetBodyId: extrudeOperation.value === "new_body" ? null : extrudeEffectiveTargetId.value,
    };
  }

  const extrudePreview = computed(() => {
    const s = previewSketchData.value;
    if (!s || sketch.sketchMode.value || panelMode.value !== "extrude") return null;
    return { placement: sketchPlacement(s), ...extent.previewSpan(sketchPlacement(s), extrudeBase()) };
  });

  const extrudePreviewError = computed(() => extrudePreview.value?.error ?? null);

  function updateExtrudePreview() {
    const preview = extrudePreview.value;
    if (!preview?.span) {
      viewportRef.value?.hideExtrudePreview();
      return;
    }
    const { entities, plane, planeOffset, planeBasis } = preview.placement;
    viewportRef.value?.showExtrudePreview(
      entities,
      { plane, offset: planeOffset, basis: planeBasis },
      preview.span,
      extrudeOperation.value === "cut" ? 0xe06a5a : 0x4da6ff,
    );
  }

  watch(extrudePreview, updateExtrudePreview);

  function onDistanceWheel(e: WheelEvent) {
    const step = e.deltaY < 0 ? 1 : -1;
    setDistance(Math.max(1, Math.round(extrudeDistance.value + step)));
  }

  // Инпут расстояния принимает выражения: «30/2», «width*2» (имена из Параметров)
  function parameterVariables(): Record<string, number> {
    return Object.fromEntries(paramsStore.parameters.value.map((p) => [p.name, p.value]));
  }

  // Значение применяется на каждый символ, но текст поля при этом не переписываем:
  // иначе «12.5» схлопывалось бы в «12» прямо под курсором.
  function onDistanceInput() {
    const value = evaluateExpression(extrudeDistanceExpr.value, parameterVariables());
    extrudeDistanceInvalid.value = value === null || !(value > 0);
    if (!extrudeDistanceInvalid.value) extrudeDistance.value = value as number;
  }

  function applyDistanceExpr() {
    onDistanceInput();
    if (!extrudeDistanceInvalid.value) {
      extrudeDistanceExpr.value = String(Number(extrudeDistance.value.toFixed(3)));
    }
  }

  function setDistance(value: number) {
    extrudeDistance.value = value;
    extrudeDistanceInvalid.value = false;
    extrudeDistanceExpr.value = String(Number(value.toFixed(3)));
  }

  function configureExtrude(settings: ExtrudeSettings) {
    if (settings.operation !== undefined) extrudeOperation.value = settings.operation;
    if (settings.targetBodyId !== undefined) extrudeTargetBodyId.value = settings.targetBodyId;
    if (settings.direction !== undefined) extrudeDirection.value = settings.direction;
    if (settings.reversed !== undefined) extrudeReversed.value = settings.reversed;
    if (settings.distance !== undefined) setDistance(settings.distance);
    extent.configure(settings);
  }

  function configureRevolve(settings: RevolveSettings) {
    if (settings.angle !== undefined) revolveAngle.value = settings.angle;
    if (settings.axis !== undefined) revolveAxis.value = settings.axis;
    if (settings.axisOrigin !== undefined) revolveAxisOrigin.value = { ...settings.axisOrigin };
    if (settings.direction !== undefined) revolveDirection.value = settings.direction;
  }

  function isBrowserBody(bodyId: string | null): boolean {
    if (!bodyId) return false;
    const source = model.bodies.value.find((body) => body.id === bodyId)?.source as Record<string, unknown> | undefined;
    return typeof source?.kind === "string" && source.kind.startsWith("browser_");
  }

  watch(extrudeOperation, (op) => {
    if (op !== "new_body" && !lastSavedSketchTargetId.value && !extrudeTargetBodyId.value) {
      extrudeTargetBodyId.value = model.bodies.value[0]?.id ?? null;
    }
  });

  function extrudeValidationError(browserTarget: boolean): string | null {
    if (previewSketchData.value === null) return "Эскиз не найден в документе.";
    if (extrudeOperation.value !== "new_body" && !browserTarget) return "Целевое тело не загружено в браузерное ядро.";
    if (extent.extentType.value === "up_to_face" && !extent.upToFace.value) return "Кликните грань, до которой выдавливать.";
    if (extent.extentType.value === "up_to_body" && !isBrowserBody(extent.upToBodyId.value)) return "Выберите browser-тело, до которого выдавливать.";
    return null;
  }

  function pickExtentFace(payload: { bodyId: string; faceId: string | number }): boolean {
    if (!lastSavedSketchId.value || panelMode.value !== "extrude") return false;
    return extent.pickFace(payload);
  }

  async function handleExtrude() {
    if (!lastSavedSketchId.value) return;
    if (extrudeOperation.value !== "new_body" && !extrudeEffectiveTargetId.value) {
      extrudeError.value = "Выберите целевое тело для операции";
      return;
    }
    const browserTarget = extrudeOperation.value !== "new_body" && isBrowserBody(extrudeEffectiveTargetId.value);
    const validationError = extrudeValidationError(browserTarget);
    if (validationError) {
      extrudeError.value = validationError;
      return;
    }
    extrudeLoading.value = true;
    extrudeError.value = null;
    const opStart = performance.now();

    try {
      const savedSketch = previewSketchData.value;
      if (!savedSketch) throw new Error("Эскиз не найден в документе.");
      const [{ BrowserExtrudeCommand }, { disposeBrowserGeometry }] = await Promise.all([
        import("@/core/commands/BrowserExtrudeCommand"),
        import("./useBrowserGeometry"),
      ]);
      stopBrowserGeometry = disposeBrowserGeometry;
      const command = new BrowserExtrudeCommand(
        projectId,
        lastSavedSketchId.value,
        sketchPlacement(savedSketch),
        extent.options({ ...extrudeBase(), targetBodyId: browserTarget ? extrudeEffectiveTargetId.value : null }),
        documentStore.version.value,
        () => documentStore.document.value,
        () => documentStore.load(projectId),
        (bodyId) => meshes.untrackMesh(bodyId),
      );

      await undoRedo.execute(command);

      const result = command.getResult();
      if (result) {
        meshes.trackMesh(result.bodyId, result.mesh);
      }

      clearSketchContext();
      documentStore.markDirty();
      await documentStore.load(projectId);
      lastOpMs.value = Math.round(performance.now() - opStart);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ошибка выдавливания";
      extrudeError.value = msg;
      console.error("Extrude failed:", err);
    } finally {
      extrudeLoading.value = false;
    }
  }

  async function handleRevolve() {
    if (!lastSavedSketchId.value) return;
    if (!(revolveAngle.value > 0) || revolveAngle.value > 360) {
      revolveError.value = "Угол вращения должен быть больше 0 и не больше 360°";
      return;
    }
    revolveLoading.value = true;
    revolveError.value = null;
    const opStart = performance.now();
    try {
      const savedSketch = previewSketchData.value;
      if (!savedSketch) throw new Error("Эскиз не найден в документе.");
      const [{ BrowserRevolveCommand }, { disposeBrowserGeometry }] = await Promise.all([
        import("@/core/commands/BrowserRevolveCommand"),
        import("./useBrowserGeometry"),
      ]);
      stopBrowserGeometry = disposeBrowserGeometry;
      const command = new BrowserRevolveCommand(
        projectId, lastSavedSketchId.value, (savedSketch.entities as SketchEntity[]) ?? [],
        (savedSketch.plane as SketchPlane) ?? "XY", typeof savedSketch.plane_offset === "number" ? savedSketch.plane_offset : 0,
        (savedSketch.plane_basis as PlaneBasis | null) ?? null, revolveAxisOrigin.value, revolveAxis.value,
        revolveAngle.value, revolveDirection.value, documentStore.version.value, () => documentStore.document.value,
        () => documentStore.load(projectId), (bodyId) => meshes.untrackMesh(bodyId),
      );

      await undoRedo.execute(command);

      const result = command.getResult();
      if (result) {
        meshes.trackMesh(result.bodyId, result.mesh);
      }

      clearSketchContext();
      documentStore.markDirty();
      await documentStore.load(projectId);
      lastOpMs.value = Math.round(performance.now() - opStart);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ошибка вращения";
      revolveError.value = msg;
      console.error("Revolve failed:", err);
    } finally {
      revolveLoading.value = false;
    }
  }

  // Настройки прошлой операции не наследуются: «симметрично» от первого
  // выдавливания молча утекало в вырез и делало карман вдвое мельче.
  function resetOperationSettings() {
    extrudeDirection.value = "one_side";
    extrudeReversed.value = false;
    extent.reset();
    revolveDirection.value = "one_side";
    revolveAngle.value = 360.0;
  }

  function startExtrudeFromSketch(sketchId: string, mode: "extrude" | "revolve" = "extrude") {
    const s = model.sketches.value.find((x) => x.id === sketchId);
    panelMode.value = mode;
    lastSavedSketchId.value = sketchId;
    lastSavedSketchTargetId.value = liveBodyId(model.bodies.value, s?.ref_body_id as string | undefined);
    extrudeOperation.value = "new_body";
    extrudeTargetBodyId.value = null;
    extrudeError.value = null;
    revolveError.value = null;
    resetOperationSettings();
  }

  function startExtrudeFromRibbon(mode: "extrude" | "revolve" = "extrude") {
    if (sketch.sketchMode.value) return;
    const selectedEntry = model.timelineEntries.value.find((e) => e.id === selection.selectedFeatureId.value);
    if (selectedEntry?.kind === "sketch" && selectedEntry.sketch_id) {
      startExtrudeFromSketch(selectedEntry.sketch_id, mode);
      return;
    }
    const freeSketch = [...model.sketches.value].reverse().find((s) => !model.sketchHasFeature(s.id));
    if (freeSketch) {
      startExtrudeFromSketch(freeSketch.id, mode);
      return;
    }
    const actionLabel = mode === "revolve" ? "«Вращать»" : "«Выдавить»";
    if (model.sketches.value.length === 0) {
      toast("Сначала создайте эскиз — кнопка «Эскиз» или клавиша S", "info");
    } else {
      toast(`Выберите эскиз в дереве модели, затем нажмите ${actionLabel}`, "info");
    }
  }

  return {
    lastSavedSketchId,
    lastSavedSketchTargetId,
    panelMode,
    extrudeDistance,
    extrudeDistanceExpr,
    extrudeDistanceInvalid,
    extrudeDirection,
    extrudeReversed,
    extrudeSignedDistance,
    extrudeOperation,
    extrudeTargetBodyId,
    extent,
    extrudePreviewError,
    pickExtentFace,
    extrudeLoading,
    extrudeError,
    revolveAngle,
    revolveAxis,
    revolveAxisOrigin,
    revolveDirection,
    revolveLoading,
    revolveError,
    lastOpMs,
    clearSketchContext,
    onDistanceWheel,
    onDistanceInput,
    applyDistanceExpr,
    configureExtrude,
    configureRevolve,
    handleExtrude,
    handleRevolve,
    startExtrudeFromSketch,
    startExtrudeFromRibbon,
  };
}

export type ExtrudeRevolveApi = ReturnType<typeof useExtrudeRevolve>;
