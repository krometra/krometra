import { computed, ref, watch, type Ref } from "vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { toast } from "@/composables/useToast";
import type { MeasureFilter, MeasureRef, MeasureResult } from "@/lib/measure";
import {
  CUSTOM_MATERIAL_ID,
  DEFAULT_MATERIAL,
  densityOf,
  itemTitle,
  materialForDensity,
  measureGroups,
  pickTitle,
  type MeasureRow,
} from "@/lib/measureFormat";
import { nextPicks } from "@/lib/measurePick";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { SelectionMode, ViewportRef } from "./types";

export function useMeasure(deps: {
  viewportRef: ViewportRef;
  viewportSelectionMode: Ref<SelectionMode>;
  meshes: BodyMeshesApi;
}) {
  const { viewportRef, viewportSelectionMode, meshes } = deps;
  const names = useDisplayNames();

  const active = ref(false);
  const filter = ref<MeasureFilter>("entity");
  const picks = ref<MeasureRef[]>([]);
  const result = ref<MeasureResult | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const materialId = ref(DEFAULT_MATERIAL.id);
  const density = ref(DEFAULT_MATERIAL.density);
  let generation = 0;

  const pickLabels = computed(() => picks.value.map((pick, index) => {
    const item = result.value?.items[index];
    return `${item ? itemTitle(item) : pickTitle(pick)} · ${names.bodyLabel(pick.bodyId)}`;
  }));

  const measuresBody = computed(() => picks.value.some((pick) => pick.kind === "body"));

  const groups = computed(() => {
    const measured = result.value;
    if (!measured) return [];
    return measureGroups(measured, pickLabels.value, density.value);
  });

  function display() {
    viewportRef.value?.showMeasure(picks.value, result.value?.pair?.points ?? null);
  }

  async function measure() {
    const current = ++generation;
    const targets = [...picks.value];
    result.value = null;
    error.value = null;
    loading.value = targets.length > 0;
    display();
    if (targets.length === 0) return;
    try {
      const { measureBrowserShapes } = await import("./browserMeasure");
      const measured = await measureBrowserShapes(targets);
      if (current === generation) result.value = measured;
    } catch (err: unknown) {
      if (current === generation) error.value = err instanceof Error ? err.message : "Не удалось выполнить измерение.";
    } finally {
      if (current === generation) {
        loading.value = false;
        display();
      }
    }
  }

  function reset() {
    generation++;
    picks.value = [];
    result.value = null;
    error.value = null;
    loading.value = false;
  }

  function enter() {
    reset();
    active.value = true;
    filter.value = "entity";
    viewportRef.value?.clearHighlight();
    viewportRef.value?.setMeasureFilter("entity");
    viewportSelectionMode.value = "measure";
    display();
  }

  function exit() {
    reset();
    active.value = false;
    display();
    viewportSelectionMode.value = "face";
  }

  function onPicked(pick: MeasureRef | null) {
    if (!active.value) return;
    picks.value = nextPicks(picks.value, pick);
    void measure();
  }

  function removePick(index: number) {
    picks.value = picks.value.filter((_, position) => position !== index);
    void measure();
  }

  function setFilter(next: MeasureFilter) {
    filter.value = next;
    viewportRef.value?.setMeasureFilter(next);
    picks.value = [];
    void measure();
  }

  function setMaterial(id: string) {
    materialId.value = id;
    density.value = densityOf(id) ?? density.value;
  }

  function setDensity(value: number) {
    density.value = value;
    materialId.value = materialForDensity(materialId.value, value);
  }

  async function copy(row: MeasureRow) {
    try {
      await navigator.clipboard.writeText(row.copy);
      toast(`Скопировано: ${row.label} ${row.copy}`, "success");
    } catch {
      toast("Браузер не дал доступ к буферу обмена.", "warning");
    }
  }

  watch(meshes.meshBodies, (bodies) => {
    if (!active.value || picks.value.length === 0) return;
    const present = new Set(bodies.map((body) => body.body_id));
    picks.value = picks.value.filter((pick) => present.has(pick.bodyId));
    void measure();
  });

  return {
    active,
    filter,
    picks,
    result,
    groups,
    pickLabels,
    measuresBody,
    loading,
    error,
    materialId,
    density,
    customMaterialId: CUSTOM_MATERIAL_ID,
    enter,
    exit,
    onPicked,
    removePick,
    setFilter,
    setMaterial,
    setDensity,
    copy,
  };
}

export type MeasureApi = ReturnType<typeof useMeasure>;
