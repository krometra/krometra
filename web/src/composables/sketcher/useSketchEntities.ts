import { ref, watch } from "vue";
import type { SketchConstraint, SketchEntity } from "@/types/api";
import { useSketch } from "@/composables/shared/useSketch";
import { useSketchSelection } from "./useSketchSelection";

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
  const selection = useSketchSelection(entities);

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
    const ids = new Set(selection.entityIds.value);
    selection.clear();
    if (ids.size === 0) return;
    entities.value = entities.value.filter((e) => !ids.has(e.id));
    constraints.value = constraints.value.filter(
      (c) => !c.anchors.some((a) => ids.has(a.entity_id))
    );
    emitChanged();
  }

  function load(data: { entities?: SketchEntity[]; constraints?: SketchConstraint[] }) {
    entities.value = data.entities ?? [];
    constraints.value = data.constraints ?? [];
    entityCounter = entities.value.length + 1;
    constraintCounter = constraints.value.length + 1;
    selection.clear();
  }

  return {
    sketchStore,
    entities,
    constraints,
    selection,
    nextEntityId,
    nextConstraintId,
    emitChanged,
    solveAndApply,
    addEntities,
    addConstraint,
    setConstraintValue,
    removeSelected,
    clearSelection: selection.clear,
    load,
  };
}

export type SketchEntitiesApi = ReturnType<typeof useSketchEntities>;
