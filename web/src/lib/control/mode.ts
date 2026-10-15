export type EditorMode =
  | "model"
  | "sketch"
  | "plane_pick"
  | "extrude"
  | "revolve"
  | "fillet"
  | "chamfer"
  | "thread"
  | "shell"
  | "mirror"
  | "boolean"
  | "sweep";

export interface EditorModeFlags {
  sketch: boolean;
  planePick: boolean;
  sweepPanel: "extrude" | "revolve" | null;
  edgeFeature: "fillet" | "chamfer" | null;
  thread: boolean;
  shell: boolean;
  mirror: boolean;
  boolean: boolean;
  sweep: boolean;
}

export function resolveEditorMode(flags: EditorModeFlags): EditorMode {
  if (flags.sketch) return "sketch";
  if (flags.planePick) return "plane_pick";
  if (flags.sweepPanel) return flags.sweepPanel;
  if (flags.edgeFeature) return flags.edgeFeature;
  if (flags.thread) return "thread";
  if (flags.shell) return "shell";
  if (flags.mirror) return "mirror";
  if (flags.boolean) return "boolean";
  if (flags.sweep) return "sweep";
  return "model";
}
