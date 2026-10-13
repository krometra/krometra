// Command pattern — interface for undo/redo
// GDD §4.2

export interface Command {
  execute(): Promise<void>;
  undo(): Promise<void>;
  label: string;
}
