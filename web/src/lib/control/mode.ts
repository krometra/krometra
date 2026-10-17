export type EditorMode =
  | "model"
  | "sketch"
  | "plane_pick"
  | "extrude"
  | "revolve"
  | "fillet"
  | "chamfer"
  | "thread"
  | "pattern"
  | "hole"
  | "shell"
  | "mirror"
  | "boolean"
  | "sweep"
  | "measure"
  | "plane";

export interface EditorModeFlags {
  sketch: boolean;
  planePick: boolean;
  sweepPanel: "extrude" | "revolve" | null;
  edgeFeature: "fillet" | "chamfer" | null;
  thread: boolean;
  shell: boolean;
  mirror: boolean;
  hole: boolean;
  pattern: boolean;
  boolean: boolean;
  sweep: boolean;
  measure: boolean;
  plane?: boolean;
}

export function resolveEditorMode(flags: EditorModeFlags): EditorMode {
  if (flags.sketch) return "sketch";
  if (flags.planePick) return "plane_pick";
  if (flags.sweepPanel) return flags.sweepPanel;
  if (flags.edgeFeature) return flags.edgeFeature;
  if (flags.thread) return "thread";
  if (flags.shell) return "shell";
  if (flags.mirror) return "mirror";
  if (flags.hole) return "hole";
  if (flags.pattern) return "pattern";
  if (flags.boolean) return "boolean";
  if (flags.sweep) return "sweep";
  if (flags.measure) return "measure";
  if (flags.plane) return "plane";
  return "model";
}
