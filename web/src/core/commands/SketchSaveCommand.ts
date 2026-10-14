import { rebuildSketchDependents } from "@/composables/editor/sketchRebuild";
import { RecordedCommand } from "./RecordedCommand";

export class SketchSaveCommand extends RecordedCommand {
  label = "Сохранить эскиз";

  constructor(
    projectId: string,
    private sketchId: string,
    private save: () => Promise<boolean>,
  ) {
    super(projectId);
  }

  protected async perform(): Promise<void> {
    if (!(await this.save())) throw new Error("Не удалось сохранить эскиз.");
  }

  protected async afterRestore(): Promise<void> {
    await rebuildSketchDependents(this.projectId, this.sketchId);
  }
}
