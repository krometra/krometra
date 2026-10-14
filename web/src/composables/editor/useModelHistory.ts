import { useDocument } from "@/composables/shared/useDocument";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import type { DocumentEdit } from "@/core/commands/DocumentEditCommand";
import { timelineChange, type TimelineChange } from "@/lib/timelineChange";
import type { TimelineEntry } from "@/types/api";
import type { BodyMeshesApi } from "./useBodyMeshes";

export type HistoryDirection = "undo" | "redo";

export interface HistoryStep {
  label: string;
  change: TimelineChange;
}

export function useModelHistory(deps: { projectId: string; meshes: BodyMeshesApi }) {
  const documentStore = useDocument();
  const undoRedo = useUndoRedo();

  function timeline(): TimelineEntry[] {
    return [...(documentStore.document.value?.timeline ?? [])];
  }

  async function refresh(before: TimelineEntry[]): Promise<TimelineChange> {
    await documentStore.load(deps.projectId);
    await deps.meshes.hydrateBodyMeshes();
    return timelineChange(before, timeline());
  }

  async function step(direction: HistoryDirection): Promise<HistoryStep | null> {
    const before = timeline();
    const command = direction === "undo" ? await undoRedo.undo() : await undoRedo.redo();
    if (!command) return null;
    return { label: command.label, change: await refresh(before) };
  }

  async function edit(label: string, change: DocumentEdit): Promise<TimelineChange> {
    const before = timeline();
    const { DocumentEditCommand } = await import("@/core/commands/DocumentEditCommand");
    await undoRedo.execute(new DocumentEditCommand(deps.projectId, label, change));
    return refresh(before);
  }

  return { step, edit, canUndo: undoRedo.canUndo, canRedo: undoRedo.canRedo };
}

export type ModelHistoryApi = ReturnType<typeof useModelHistory>;
