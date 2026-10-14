export interface Command {
  execute(): Promise<void>;
  undo(): Promise<void>;
  label: string;
}
