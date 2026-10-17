import { computed, ref } from "vue";
import { useSelection } from "@/composables/shared/useSelection";
import { useSketch } from "@/composables/shared/useSketch";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { apiErrorMessage, toast } from "@/composables/useToast";
import type { TimelineEdit } from "@/core/commands/TimelineEditCommand";
import {
  deleteRolledBack,
  deleteTimelineEntry,
  rollTimelineTo,
  setEntrySuppressed,
  sketchDependents,
} from "@/lib/timelineEdits";
import { isFailed, isSuppressed, rollbackIndex } from "@/lib/timelineFlags";
import { entryDeleteBlock, isOpenSketchEntry } from "@/lib/timelineGuards";
import type { TimelineChange } from "@/lib/timelineChange";
import type { TimelineEntry } from "@/types/api";
import type { useDocumentModel } from "./useDocumentModel";
import type { ModelHistoryApi } from "./useModelHistory";
import { useHistoryLock } from "./useHistoryLock";

export interface PendingSketchDelete {
  entryId: string;
  label: string;
  dependents: string[];
}

export function useTimelineEdits(deps: { model: ReturnType<typeof useDocumentModel>; history: ModelHistoryApi }) {
  const { model, history } = deps;
  const selection = useSelection();
  const names = useDisplayNames();
  const sketch = useSketch();
  const lock = useHistoryLock();
  const pendingSketchDelete = ref<PendingSketchDelete | null>(null);
  const marker = computed(() => rollbackIndex(model.timelineEntries.value));
  const rolledBack = computed(() => marker.value < model.timelineEntries.value.length);

  function entryOf(entryId: string): TimelineEntry | undefined {
    return model.timelineEntries.value.find((entry) => entry.id === entryId);
  }

  function reportFailures(change: TimelineChange) {
    const failed = [...change.changed, ...change.added].filter(isFailed);
    if (failed.length === 0) return;
    toast(`Не построились: ${failed.map(names.entryLabel).join(", ")}. Причина — в подсказке на шкале истории.`, "warning");
  }

  function refused(reason: string | null): boolean {
    if (reason) toast(reason, "warning");
    return reason !== null;
  }

  async function run(label: string, edit: TimelineEdit) {
    try {
      const change = await history.editTimeline(label, edit);
      toast(`${label}: готово. Отменить — Ctrl+Z`, "success");
      reportFailures(change);
    } catch (error) {
      toast(apiErrorMessage(error, "Не удалось изменить историю"), "warning");
    }
  }

  function deleteEntry(entryId: string) {
    const entry = entryOf(entryId);
    if (!entry) return Promise.resolve();
    if (isOpenSketchEntry(lock.state.value, entry)) sketch.exitSketch();
    if (selection.selectedFeatureId.value === entryId) selection.clearSelection();
    return run(`Удалить ${names.entryLabel(entry)}`, (document) => deleteTimelineEntry(document, entryId));
  }

  function requestDelete(entryId: string) {
    const entry = entryOf(entryId);
    if (!entry || refused(entryDeleteBlock(lock.state.value, entry))) return Promise.resolve();
    const dependents = sketchDependents({ components: {}, timeline: model.timelineEntries.value }, entryId);
    if (dependents.length === 0) return deleteEntry(entryId);
    pendingSketchDelete.value = { entryId, label: names.entryLabel(entry), dependents: dependents.map(names.entryLabel) };
    return Promise.resolve();
  }

  function requestSketchDelete(sketchId: string) {
    const entry = model.timelineEntries.value.find((candidate) => candidate.kind === "sketch" && candidate.sketch_id === sketchId);
    return entry ? requestDelete(entry.id) : Promise.resolve();
  }

  function deleteSelected() {
    const entryId = selection.selectedFeatureId.value;
    return entryId ? requestDelete(entryId) : Promise.resolve();
  }

  function confirmSketchDelete() {
    const pending = pendingSketchDelete.value;
    pendingSketchDelete.value = null;
    return pending ? deleteEntry(pending.entryId) : Promise.resolve();
  }

  function cancelSketchDelete() {
    pendingSketchDelete.value = null;
  }

  function toggleSuppressed(entryId: string) {
    const entry = entryOf(entryId);
    if (!entry || refused(lock.reason.value)) return Promise.resolve();
    const suppressed = !isSuppressed(entry);
    const label = `${suppressed ? "Подавить" : "Вернуть"} ${names.entryLabel(entry)}`;
    return run(label, (document) => setEntrySuppressed(document, entryId, suppressed));
  }

  function rollTo(index: number) {
    if (index === marker.value || refused(lock.reason.value)) return Promise.resolve();
    const label = index >= model.timelineEntries.value.length ? "Вернуть маркер в конец" : "Откатить историю";
    return run(label, (document) => rollTimelineTo(document, index));
  }

  function rollAfter(entryId: string) {
    const index = model.timelineEntries.value.findIndex((entry) => entry.id === entryId);
    return index < 0 ? Promise.resolve() : rollTo(index + 1);
  }

  function deleteAfterMarker() {
    if (refused(lock.reason.value)) return Promise.resolve();
    return run("Удалить всё после маркера", (document) => deleteRolledBack(document, names.entryLabel));
  }

  return {
    marker,
    rolledBack,
    lockReason: lock.reason,
    pendingSketchDelete,
    requestDelete,
    requestSketchDelete,
    deleteSelected,
    confirmSketchDelete,
    cancelSketchDelete,
    toggleSuppressed,
    rollTo,
    rollAfter,
    deleteAfterMarker,
  };
}

export type TimelineEditsApi = ReturnType<typeof useTimelineEdits>;
