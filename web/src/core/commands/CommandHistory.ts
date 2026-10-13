// CommandHistory — undo/redo stack
// GDD §4.2

import type { Command } from "./Command";

export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  async execute(cmd: Command): Promise<void> {
    await cmd.execute();
    this.undoStack.push(cmd);
    this.redoStack = [];
  }

  async undo(): Promise<void> {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    await cmd.undo();
    this.redoStack.push(cmd);
  }

  async redo(): Promise<void> {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    await cmd.execute();
    this.undoStack.push(cmd);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
