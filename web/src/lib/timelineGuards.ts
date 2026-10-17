export const SKETCH_OPEN_REASON = "Сначала закройте эскиз: ОК или Отмена";

export interface HistoryLockState {
  sketchOpen: boolean;
  activeSketchId: string | null;
}

export interface LockableItem {
  editsModel?: boolean;
  disabled?: boolean;
  hint?: string;
}

export function historyLockReason(state: HistoryLockState): string | null {
  return state.sketchOpen ? SKETCH_OPEN_REASON : null;
}

export function isOpenSketch(state: HistoryLockState, sketchId: string | null | undefined): boolean {
  return state.sketchOpen && !!sketchId && state.activeSketchId === sketchId;
}

export function isOpenSketchEntry(state: HistoryLockState, entry: { kind: string; sketch_id?: string | null }): boolean {
  return entry.kind === "sketch" && isOpenSketch(state, entry.sketch_id);
}

export function sketchDeleteBlock(state: HistoryLockState, sketchId: string): string | null {
  return isOpenSketch(state, sketchId) ? null : historyLockReason(state);
}

export function entryDeleteBlock(state: HistoryLockState, entry: { kind: string; sketch_id?: string | null }): string | null {
  return isOpenSketchEntry(state, entry) ? null : historyLockReason(state);
}

export function lockItems<T extends LockableItem>(items: T[], reason: string | null): T[] {
  if (!reason) return items;
  return items.map((item) => (item.editsModel ? { ...item, disabled: true, hint: reason } : item));
}
