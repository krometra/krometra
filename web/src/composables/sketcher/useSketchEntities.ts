import { ref, watch } from "vue";
import type { SketchConstraint, SketchEntity } from "@/types/api";
import { useSketch } from "@/composables/shared/useSketch";
import { setConstructionFlag, toggledConstructionFlag } from "@/sketcher/construction";

/**
 * Владелец сущностей и ограничений эскиза: локальное состояние канвы плюс
 * двусторонняя синхронизация с решателем в useSketch.
 */
export function useSketchEntities(onChange: (payload: {
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}) => void) {
  const sketchStore = useSketch();

  const entities = ref<SketchEntity[]>([]);
  const constraints = ref<SketchConstraint[]>([]);
  const selectedEntityIds = ref<string[]>([]);

  let entityCounter = 1;
  let constraintCounter = 1;
  let lastSyncedEntities = "";

  function nextEntityId(): string {
    return `sketch-entity-${entityCounter++}-${Date.now()}`;
  }

  function nextConstraintId(): string {
    return `constraint-${constraintCounter++}-${Date.now()}`;
  }

  function emitChanged() {
    lastSyncedEntities = JSON.stringify(entities.value);
    onChange({ entities: entities.value, constraints: constraints.value });
  }

  function solveAndApply() {
    emitChanged();
    void sketchStore.solve();
  }

  watch(
    () => sketchStore.entities.value,
    (incoming) => {
      const serialized = JSON.stringify(incoming);
      if (serialized === lastSyncedEntities) return;
      // Прилетело из стора (undo/redo/решатель) — принимаем, но НЕ отправляем
      // обратно: эхо создавало новую запись в истории, и Ctrl+Z не заканчивался.
      lastSyncedEntities = serialized;
      entities.value = JSON.parse(serialized) as SketchEntity[];
    },
    { deep: true }
  );

  watch(
    () => sketchStore.constraints.value,
    (incoming) => {
      const serialized = JSON.stringify(incoming);
      if (serialized === JSON.stringify(constraints.value)) return;
      constraints.value = JSON.parse(serialized) as SketchConstraint[];
    },
    { deep: true }
  );

  function addEntities(created: SketchEntity[]) {
    entities.value = [...entities.value, ...created];
  }

  function addConstraint(constraint: SketchConstraint, opts: { silent?: boolean } = {}) {
    const exists = constraints.value.some(
      (existing) =>
        existing.type === constraint.type &&
        existing.anchors.length === constraint.anchors.length &&
        existing.anchors.every(
          (a, i) =>
            a.entity_id === constraint.anchors[i].entity_id &&
            a.sub_index === constraint.anchors[i].sub_index
        )
    );
    if (exists) return;

    constraints.value = [...constraints.value, constraint];
    if (!opts.silent) emitChanged();
  }

  function setConstraintValue(constraintId: string, value: number) {
    constraints.value = constraints.value.map((c) => (c.id === constraintId ? { ...c, value } : c));
    solveAndApply();
  }

  function removeSelected() {
    if (selectedEntityIds.value.length === 0) return;
    const ids = new Set(selectedEntityIds.value);
    entities.value = entities.value.filter((e) => !ids.has(e.id));
    constraints.value = constraints.value.filter(
      (c) => !c.anchors.some((a) => ids.has(a.entity_id))
    );
    selectedEntityIds.value = [];
    emitChanged();
  }

  function toggleConstructionOfSelected() {
    const flag = toggledConstructionFlag(entities.value, selectedEntityIds.value);
    if (flag === null) return;
    entities.value = setConstructionFlag(entities.value, selectedEntityIds.value, flag);
    emitChanged();
  }

  function toggleSelection(entityId: string) {
    const idx = selectedEntityIds.value.indexOf(entityId);
    if (idx >= 0) {
      selectedEntityIds.value = selectedEntityIds.value.filter((id) => id !== entityId);
    } else {
      selectedEntityIds.value = [...selectedEntityIds.value, entityId];
    }
  }

  function clearSelection() {
    selectedEntityIds.value = [];
  }

  function load(data: { entities?: SketchEntity[]; constraints?: SketchConstraint[] }) {
    entities.value = data.entities ?? [];
    constraints.value = data.constraints ?? [];
    entityCounter = entities.value.length + 1;
    constraintCounter = constraints.value.length + 1;
    selectedEntityIds.value = [];
  }

  return {
    sketchStore,
    entities,
    constraints,
    selectedEntityIds,
    nextEntityId,
    nextConstraintId,
    emitChanged,
    solveAndApply,
    addEntities,
    addConstraint,
    setConstraintValue,
    removeSelected,
    toggleConstructionOfSelected,
    toggleSelection,
    clearSelection,
    load,
  };
}

export type SketchEntitiesApi = ReturnType<typeof useSketchEntities>;
