import { useApi } from "@/composables/useApi";
import type { ModelDocument } from "@/lib/bodyHistory";
import type { RegenSeeds } from "@/lib/browserRebuildPlan";
import type { TimelineEditResult } from "@/lib/timelineEdits";
import type { Document } from "@/types/api";
import { modelDocumentOf, regenerateStoredTimeline, saveRegeneratedTimeline } from "./browserRegen";
import { RecordedCommand } from "./RecordedCommand";

export type TimelineEdit = (document: ModelDocument) => TimelineEditResult;

export class TimelineEditCommand extends RecordedCommand {
  private restoreSeeds: RegenSeeds = { roots: [], bodies: [] };

  constructor(
    projectId: string,
    public label: string,
    private edit: TimelineEdit,
  ) {
    super(projectId);
  }

  protected async perform(): Promise<void> {
    const current = await useApi().get<Document>(`/projects/${this.projectId}/document`);
    const result = this.edit(modelDocumentOf(current));
    this.restoreSeeds = result.restoreSeeds;
    await saveRegeneratedTimeline(this.projectId, current, result.document, result.seeds);
  }

  protected async afterRestore(): Promise<void> {
    await regenerateStoredTimeline(this.projectId, this.restoreSeeds);
  }
}
