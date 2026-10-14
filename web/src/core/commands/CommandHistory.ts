import type { Command } from "./Command";

export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  async execute(cmd: Command): Promise<void> {
    await cmd.execute();
    this.undoStack.push(cmd);
    this.redoStack = [];
  }

  async undo(): Promise<Command | null> {
    const cmd = this.undoStack.at(-1);
    if (!cmd) return null;
    await cmd.undo();
    this.undoStack.pop();
    this.redoStack.push(cmd);
    return cmd;
  }

  async redo(): Promise<Command | null> {
    const cmd = this.redoStack.at(-1);
    if (!cmd) return null;
    await cmd.execute();
    this.redoStack.pop();
    this.undoStack.push(cmd);
    return cmd;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
