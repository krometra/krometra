// Shared sketch composable — manages sketch mode, active tool, persistence

import { ref, type Ref } from "vue";
import { createSharedComposable } from "@vueuse/core";
import type { SketchPlane, PlaneBasis, SketchData, SketchEntity, SketchConstraint, SketchSaveResponse } from "@/types/api";
import { ConstraintSolver } from "@/sketcher/solver/ConstraintSolver";
import { createSketchHistory } from "@/sketcher/history";
import { useApi } from "../useApi";

export type SketchTool =
  | "select"
  | "line" | "rectangle" | "circle" | "arc"
  | "aux-parallel" | "aux-perpendicular" | "aux-vertical" | "aux-horizontal";

export const useSketch = createSharedComposable(() => {
  const activeSketchId: Ref<string | null> = ref(null);
  const sketchMode = ref(false);
  const currentTool: Ref<SketchTool> = ref("select");
  const sketchPlane: Ref<SketchPlane> = ref("XY");
  const planeOffset = ref(0);
  const planeBasis: Ref<PlaneBasis | null> = ref(null);
  const refBodyId: Ref<string | null> = ref(null);
  const refFaceId: Ref<string | number | null> = ref(null);
  const entities: Ref<SketchEntity[]> = ref([]);
  const constraints: Ref<SketchConstraint[]> = ref([]);
  const isLoading = ref(false);
  const lastSavedVersion = ref(0);
  const conflict = ref(false);
  const solver = ref<ConstraintSolver | null>(null);
  const isSolving = ref(false);
  const solveResidual = ref(0);
  const history = createSketchHistory();

  function snapshot() {
    return { entities: entities.value, constraints: constraints.value };
  }

  /** Record the current state so Ctrl+Z can come back to it. */
  function commitHistory() {
    history.commit(snapshot());
  }

  function applySnapshot(s: { entities: SketchEntity[]; constraints: SketchConstraint[] }) {
    entities.value = s.entities;
    constraints.value = s.constraints;
  }

  async function undo(): Promise<boolean> {
    const s = history.undo();
    if (!s) return false;
    applySnapshot(s);
    await solve();
    return true;
  }

  async function redo(): Promise<boolean> {
    const s = history.redo();
    if (!s) return false;
    applySnapshot(s);
    await solve();
    return true;
  }

  function startSketch(sketchId: string) {
    activeSketchId.value = sketchId;
    sketchMode.value = true;
    entities.value = [];
    constraints.value = [];
    conflict.value = false;
    history.reset(snapshot());
  }

  function exitSketch() {
    sketchMode.value = false;
    activeSketchId.value = null;
    entities.value = [];
    constraints.value = [];
    lastSavedVersion.value = 0;
    conflict.value = false;
    planeOffset.value = 0;
    planeBasis.value = null;
    refBodyId.value = null;
    refFaceId.value = null;
    if (solver.value) {
      solver.value.terminate();
      solver.value = null;
    }
  }

  function setTool(tool: SketchTool) {
    currentTool.value = tool;
  }

  function setPlane(plane: SketchPlane, offset = 0) {
    sketchPlane.value = plane;
    planeOffset.value = offset;
    planeBasis.value = null;
    refBodyId.value = null;
    refFaceId.value = null;
  }

  function setFacePlane(
    plane: SketchPlane | null,
    offset: number,
    basis: PlaneBasis | null,
    bodyId: string,
    faceId: string | number,
  ) {
    sketchPlane.value = plane ?? "XY";
    planeOffset.value = offset;
    planeBasis.value = basis;
    refBodyId.value = bodyId;
    refFaceId.value = faceId;
  }

  function addEntity(entity: SketchEntity) {
    entities.value = [...entities.value, entity];
    commitHistory();
    solve();
  }

  function removeEntity(entityId: string) {
    entities.value = entities.value.filter((e) => e.id !== entityId);
    constraints.value = constraints.value.filter(
      (c) => !c.anchors.some((a) => a.entity_id === entityId)
    );
    commitHistory();
    solve();
  }

  function setEntities(newEntities: SketchEntity[]) {
    entities.value = newEntities;
    commitHistory();
  }

  /**
   * Применить правку с канвы эскиза: сущности и ограничения меняются вместе и
   * дают ОДИН шаг истории. Повторная отправка того же состояния (канва шлёт
   * событие и на простое перетаскивание мыши) историю не засоряет.
   */
  function applyCanvasEdit(
    newEntities: SketchEntity[],
    newConstraints?: SketchConstraint[],
  ) {
    const sameEntities =
      JSON.stringify(newEntities) === JSON.stringify(entities.value);
    const sameConstraints =
      newConstraints === undefined ||
      JSON.stringify(newConstraints) === JSON.stringify(constraints.value);
    if (sameEntities && sameConstraints) return;

    entities.value = newEntities;
    if (newConstraints !== undefined) constraints.value = newConstraints;
    commitHistory();
  }

  // --- Constraints ---

  function addConstraint(c: SketchConstraint) {
    constraints.value = [...constraints.value, c];
    commitHistory();
    solve();
  }

  function removeConstraint(constraintId: string) {
    constraints.value = constraints.value.filter((c) => c.id !== constraintId);
    commitHistory();
    solve();
  }

  function updateConstraintValue(constraintId: string, value: number) {
    constraints.value = constraints.value.map((c) =>
      c.id === constraintId ? { ...c, value } : c
    );
    commitHistory();
    solve();
  }

  function setConstraints(newConstraints: SketchConstraint[]) {
    constraints.value = newConstraints;
    commitHistory();
  }

  async function solve() {
    if (!solver.value) solver.value = new ConstraintSolver();
    isSolving.value = true;
    try {
      const result = await solver.value.solve(entities.value, constraints.value);
      // Результат решателя — следствие уже записанной правки, а не отдельный
      // шаг: он обновляет и текущее состояние истории, чтобы Ctrl+Z вернулся
      // к решённой геометрии, а не к состоянию «до досчёта».
      entities.value = result.entities;
      history.amend({ entities: entities.value, constraints: constraints.value });
      solveResidual.value = result.residual;
    } catch {
      // solver error — keep current state
    } finally {
      isSolving.value = false;
    }
  }

  async function loadSketchData(projectId: string, sketchId: string): Promise<boolean> {
    isLoading.value = true;
    try {
      const api = useApi();
      const data = await api.get<SketchData>(
        `/projects/${projectId}/sketches/${sketchId}`
      );
      sketchPlane.value = data.plane;
      planeOffset.value = data.plane_offset ?? 0;
      planeBasis.value = data.plane_basis ?? null;
      refBodyId.value = data.ref_body_id ?? null;
      refFaceId.value = data.ref_face_id ?? null;
      entities.value = data.entities ?? [];
      constraints.value = data.constraints ?? [];
      // Baseline for undo: the sketch as it was loaded.
      history.reset(snapshot());
      // Solve after loading to apply constraints
      if (constraints.value.length > 0) {
        await solve();
      }
      return true;
    } catch (e: unknown) {
      const err = e as { error?: string };
      // 404 = new sketch — start empty
      if (err.error === "sketch_not_found") {
        entities.value = [];
        constraints.value = [];
        history.reset(snapshot());
        return true;
      }
      console.error("Failed to load sketch:", err);
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function saveSketchData(projectId: string, sketchId: string): Promise<boolean> {
    if (!sketchId) return false;

    isLoading.value = true;
    conflict.value = false;

    try {
      const api = useApi();
      const data: SketchData = {
        plane: sketchPlane.value,
        plane_offset: planeOffset.value,
        plane_basis: planeBasis.value,
        ref_body_id: refBodyId.value,
        ref_face_id: refFaceId.value,
        entities: entities.value,
        constraints: constraints.value,
      };
      const result = await api.put<SketchSaveResponse>(
        `/projects/${projectId}/sketches/${sketchId}`,
        data
      );
      lastSavedVersion.value = result.version;
      return true;
    } catch (e: unknown) {
      const err = e as { error?: string };
      if (err.error === "version_conflict") {
        conflict.value = true;
      }
      console.error("Failed to save sketch:", err);
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    activeSketchId,
    sketchMode,
    currentTool,
    sketchPlane,
    planeOffset,
    planeBasis,
    refBodyId,
    refFaceId,
    entities,
    constraints,
    isLoading,
    lastSavedVersion,
    conflict,
    isSolving,
    solveResidual,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo,
    redo,
    startSketch,
    exitSketch,
    setTool,
    setPlane,
    setFacePlane,
    addEntity,
    removeEntity,
    setEntities,
    applyCanvasEdit,
    addConstraint,
    removeConstraint,
    updateConstraintValue,
    setConstraints,
    solve,
    loadSketchData,
    saveSketchData,
  };
});
