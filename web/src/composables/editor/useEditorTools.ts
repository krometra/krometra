import { computed, type Ref } from "vue";
import type { BrepTopo } from "@/types/api";
import type { RibbonAction } from "./types";

export type FacePick = { bodyId: string; faceId: string | number; brepTopo: BrepTopo };

export interface EditorTool {
  actions: RibbonAction[];
  active: Readonly<Ref<boolean>>;
  loading: Readonly<Ref<boolean>>;
  busyLabel: string;
  enter: (action: RibbonAction) => void;
  exit: () => void;
  onFaceSelected?: (payload: FacePick) => boolean | void;
  onSelectionCleared?: () => void;
}

export function useEditorTools(tools: EditorTool[]) {
  const activeTool = computed(() => tools.find((tool) => tool.active.value) ?? null);

  function leaveAll() {
    for (const tool of tools) if (tool.active.value) tool.exit();
  }

  function enter(action: RibbonAction): boolean {
    const tool = tools.find((candidate) => candidate.actions.includes(action));
    if (!tool) return false;
    tool.enter(action);
    return true;
  }

  function exitActive(): boolean {
    const tool = activeTool.value;
    if (!tool) return false;
    tool.exit();
    return true;
  }

  function onFaceSelected(payload: FacePick): boolean {
    const tool = activeTool.value;
    if (!tool?.onFaceSelected) return false;
    return tool.onFaceSelected(payload) !== false;
  }

  function onSelectionCleared() {
    for (const tool of tools) tool.onSelectionCleared?.();
  }

  const busyLabel = computed(() => tools.find((tool) => tool.loading.value)?.busyLabel ?? null);
  const anyActive = computed(() => activeTool.value !== null);

  return { leaveAll, enter, exitActive, onFaceSelected, onSelectionCleared, busyLabel, anyActive };
}
