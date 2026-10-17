import { computed, ref, watch, type Ref } from "vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { useParameters } from "@/composables/useParameters";
import { apiErrorMessage } from "@/composables/useToast";
import type { MeasureRef } from "@/lib/measure";
import { parameterQuantities } from "@/lib/units";
import {
  computeWorkPlaneFrame,
  pointOf,
  type AxisRef,
  type FaceRef,
  type PlaneRef,
  type PointRef,
  type WorkPlaneDefinition,
  type WorkPlaneFrame,
  type WorkPlaneGeometry,
  type WorkPlaneKind,
} from "@/lib/workPlane";
import { meshEdgeLine, meshFacePlane, vertexRefAt } from "@/lib/workPlaneMesh";
import type { SketchPlane } from "@/types/api";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { useDocumentModel } from "./useDocumentModel";
import type { EditorTool } from "./useEditorTools";
import { useQuantityField } from "./useQuantityField";
import type { SelectionMode, ViewportRef } from "./types";

export type WorkPlanePickSlot = "reference" | "axis" | "points" | "faces";

const DEFAULT_SLOT: Record<WorkPlaneKind, WorkPlanePickSlot> = {
  offset: "reference",
  angle: "axis",
  three_points: "points",
  midplane: "faces",
};

const PICK_HINTS: Record<WorkPlanePickSlot, string> = {
  reference: "Кликните плоскую грань тела — от неё отложится плоскость.",
  axis: "Кликните прямое ребро тела — плоскость повернётся вокруг него.",
  points: "Кликните вершины тела — нужно три точки.",
  faces: "Кликните две параллельные плоские грани.",
};

export function useWorkPlaneTool(deps: {
  viewportRef: ViewportRef;
  viewportSelectionMode: Ref<SelectionMode>;
  meshes: BodyMeshesApi;
  model: ReturnType<typeof useDocumentModel>;
  geometry: () => WorkPlaneGeometry;
  definitionOf: (planeId: string) => WorkPlaneDefinition | null;
  save: (planeId: string | null, definition: WorkPlaneDefinition) => Promise<string>;
}) {
  const { viewportRef, viewportSelectionMode, meshes, model } = deps;
  const names = useDisplayNames();
  const parameters = useParameters();
  const variables = () => parameterQuantities(parameters.parameters.value);

  const active = ref(false);
  const editingId = ref<string | null>(null);
  const kind = ref<WorkPlaneKind>("offset");
  const reference = ref<PlaneRef>({ kind: "base", plane: "XY" });
  const axis = ref<AxisRef | null>(null);
  const points = ref<PointRef[]>([]);
  const faces = ref<FaceRef[]>([]);
  const picking = ref<WorkPlanePickSlot | null>(null);
  const pickHint = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const distanceField = useQuantityField({ dimension: "length", initial: 10, variables, rangeError: () => null });
  const angleField = useQuantityField({
    dimension: "angle",
    initial: 45,
    variables,
    rangeError: (value) => (Math.abs(value) <= 360 ? null : "Угол — от −360° до 360°."),
  });

  const definition = computed<WorkPlaneDefinition | null>(() => {
    if (kind.value === "offset") return { kind: "offset", reference: reference.value, distance: distanceField.value.value };
    if (kind.value === "angle") return axis.value ? { kind: "angle", axis: axis.value, reference: reference.value, angle: angleField.value.value } : null;
    if (kind.value === "three_points") return points.value.length === 3 ? { kind: "three_points", points: points.value } : null;
    return faces.value.length === 2 ? { kind: "midplane", faces: faces.value } : null;
  });

  const preview = computed<{ frame: WorkPlaneFrame | null; error: string | null }>(() => {
    if (!active.value || !definition.value) return { frame: null, error: null };
    try {
      return { frame: computeWorkPlaneFrame(definition.value, deps.geometry()), error: null };
    } catch (err) {
      return { frame: null, error: err instanceof Error ? err.message : String(err) };
    }
  });

  const fieldError = computed(() => (kind.value === "offset" ? distanceField.error.value : kind.value === "angle" ? angleField.error.value : null));
  const canApply = computed(() => preview.value.frame !== null && fieldError.value === null && !loading.value);

  const sketchOptions = computed(() => model.sketches.value.map((sketch) => ({ value: sketch.id, label: names.sketchLabel(sketch.id) })));
  const sketchLineOptions = computed(() => model.sketches.value.flatMap((sketch) => {
    const lines = (sketch.entities ?? []).filter((entity) => (entity as { type?: string }).type === "line") as { id: string }[];
    return lines.map((line, index) => ({ value: `${sketch.id}:${line.id}`, label: `${names.sketchLabel(sketch.id)} · отрезок ${index + 1}` }));
  }));

  watch(() => preview.value.frame, (frame) => {
    const viewport = viewportRef.value;
    if (!viewport) return;
    if (frame) viewport.showWorkPlanePreview(frame);
    else viewport.hideWorkPlanePreview();
  });

  function meshOf(bodyId: string) {
    return meshes.meshBodies.value.find((body) => body.body_id === bodyId)?.mesh;
  }

  function vertexPoint(ref: PointRef): MeasureRef[] {
    if (ref.kind !== "vertex") return [];
    try {
      return [{ kind: "vertex", bodyId: ref.bodyId, point: pointOf(ref, deps.geometry()) }];
    } catch {
      return [];
    }
  }

  function pickedRefs(): MeasureRef[] {
    const face = (ref: FaceRef): MeasureRef => ({ kind: "face", bodyId: ref.bodyId, faceId: ref.faceName });
    if (kind.value === "offset" || kind.value === "angle") {
      const refs: MeasureRef[] = reference.value.kind === "face" ? [face(reference.value)] : [];
      if (kind.value === "angle" && axis.value?.kind === "edge") refs.push({ kind: "edge", bodyId: axis.value.bodyId, edgeId: axis.value.edgeName });
      return refs;
    }
    if (kind.value === "three_points") return points.value.flatMap(vertexPoint);
    return faces.value.map(face);
  }

  function showPicked() {
    viewportRef.value?.showMeasure(active.value ? pickedRefs() : [], null);
  }

  watch([kind, reference, axis, points, faces, active], showPicked);

  function stopPicking() {
    picking.value = null;
    pickHint.value = null;
    viewportSelectionMode.value = "face";
  }

  function startPicking(slot: WorkPlanePickSlot) {
    picking.value = slot;
    pickHint.value = PICK_HINTS[slot];
    viewportRef.value?.clearHighlight();
    viewportRef.value?.setMeasureFilter("entity");
    viewportSelectionMode.value = "pick";
  }

  function resetForm() {
    kind.value = "offset";
    reference.value = { kind: "base", plane: "XY" };
    axis.value = null;
    points.value = [];
    faces.value = [];
    distanceField.set(10);
    angleField.set(45);
    error.value = null;
  }

  function loadDefinition(source: WorkPlaneDefinition) {
    kind.value = source.kind;
    if (source.kind === "offset") {
      reference.value = source.reference;
      distanceField.set(source.distance);
    } else if (source.kind === "angle") {
      axis.value = source.axis;
      reference.value = source.reference;
      angleField.set(source.angle);
    } else if (source.kind === "three_points") points.value = [...source.points];
    else faces.value = [...source.faces];
  }

  function enter() {
    resetForm();
    editingId.value = null;
    active.value = true;
    startPicking("reference");
  }

  function editPlane(planeId: string) {
    const source = deps.definitionOf(planeId);
    if (!source) return;
    resetForm();
    loadDefinition(source);
    editingId.value = planeId;
    active.value = true;
    stopPicking();
  }

  function exit() {
    stopPicking();
    active.value = false;
    editingId.value = null;
    error.value = null;
    viewportRef.value?.hideWorkPlanePreview();
    viewportRef.value?.showMeasure([], null);
  }

  function setKind(next: WorkPlaneKind) {
    kind.value = next;
    error.value = null;
    startPicking(DEFAULT_SLOT[next]);
  }

  function selectBasePlane(plane: SketchPlane) {
    reference.value = { kind: "base", plane };
    if (picking.value === "reference") stopPicking();
  }

  function selectSketchPlane(sketchId: string) {
    reference.value = { kind: "sketch", sketchId };
    if (picking.value === "reference") stopPicking();
  }

  function selectSketchLine(value: string) {
    const [sketchId, entityId] = value.split(":");
    if (!sketchId || !entityId) return;
    axis.value = { kind: "sketch_line", sketchId, entityId };
    if (reference.value.kind === "base") reference.value = { kind: "sketch", sketchId };
    if (picking.value === "axis") stopPicking();
  }

  function removePoint(index: number) {
    points.value = points.value.filter((_, position) => position !== index);
  }

  function removeFace(index: number) {
    faces.value = faces.value.filter((_, position) => position !== index);
  }

  function pickFace(pick: MeasureRef): FaceRef | null {
    if (pick.kind !== "face") return null;
    const mesh = meshOf(pick.bodyId);
    return mesh && meshFacePlane(mesh, pick.faceId) ? { bodyId: pick.bodyId, faceName: pick.faceId } : null;
  }

  function pickAxis(pick: MeasureRef): AxisRef | null {
    if (pick.kind !== "edge") return null;
    const mesh = meshOf(pick.bodyId);
    return mesh && meshEdgeLine(mesh, pick.edgeId)?.straight ? { kind: "edge", bodyId: pick.bodyId, edgeName: pick.edgeId } : null;
  }

  function pickPoint(pick: MeasureRef): PointRef | null {
    const mesh = meshOf(pick.bodyId);
    return pick.kind === "vertex" && mesh ? vertexRefAt(mesh, pick.bodyId, pick.point) : null;
  }

  function accept(slot: WorkPlanePickSlot, pick: MeasureRef): boolean {
    if (slot === "reference") {
      const face = pickFace(pick);
      if (face) reference.value = { kind: "face", ...face };
      return face !== null;
    }
    if (slot === "axis") {
      const edge = pickAxis(pick);
      if (edge) axis.value = edge;
      return edge !== null;
    }
    if (slot === "points") {
      const point = pickPoint(pick);
      if (point) points.value = [...points.value, point].slice(-3);
      return point !== null;
    }
    const face = pickFace(pick);
    if (face) faces.value = [...faces.value, face].slice(-2);
    return face !== null;
  }

  function slotFilled(slot: WorkPlanePickSlot): boolean {
    if (slot === "points") return points.value.length === 3;
    if (slot === "faces") return faces.value.length === 2;
    return true;
  }

  function onPicked(pick: MeasureRef | null) {
    const slot = picking.value;
    if (!active.value || !slot || !pick) return;
    if (!accept(slot, pick)) {
      pickHint.value = `Не подходит. ${PICK_HINTS[slot]}`;
      return;
    }
    if (slotFilled(slot)) stopPicking();
    else pickHint.value = PICK_HINTS[slot];
  }

  async function apply() {
    distanceField.commit();
    angleField.commit();
    const current = definition.value;
    if (!current || !canApply.value) return;
    loading.value = true;
    error.value = null;
    try {
      await deps.save(editingId.value, current);
      exit();
    } catch (err) {
      error.value = apiErrorMessage(err, "Не удалось построить рабочую плоскость");
    } finally {
      loading.value = false;
    }
  }

  const tool: EditorTool = { actions: ["plane"], active, loading, busyLabel: "Рабочая плоскость…", enter, exit };

  return {
    tool,
    active,
    editingId,
    kind,
    reference,
    axis,
    points,
    faces,
    picking,
    pickHint,
    loading,
    error,
    distanceField,
    angleField,
    definition,
    preview,
    canApply,
    sketchOptions,
    sketchLineOptions,
    enter,
    editPlane,
    exit,
    setKind,
    selectBasePlane,
    selectSketchPlane,
    selectSketchLine,
    removePoint,
    removeFace,
    startPicking,
    stopPicking,
    onPicked,
    apply,
  };
}

export type WorkPlaneToolApi = ReturnType<typeof useWorkPlaneTool>;
