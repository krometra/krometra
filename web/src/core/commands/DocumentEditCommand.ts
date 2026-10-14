import { useApi } from "@/composables/useApi";
import type { ModelDocument } from "@/lib/bodyHistory";
import type { Document } from "@/types/api";
import { RecordedCommand } from "./RecordedCommand";

export type DocumentEdit = (document: ModelDocument) => ModelDocument;

export class DocumentEditCommand extends RecordedCommand {
  constructor(
    projectId: string,
    public label: string,
    private edit: DocumentEdit,
  ) {
    super(projectId);
  }

  protected async perform(): Promise<void> {
    const api = useApi();
    const document = await api.get<Document>(`/projects/${this.projectId}/document`);
    const next = this.edit({ components: document.components ?? {}, timeline: document.timeline ?? [] });
    await api.put<Document>(`/projects/${this.projectId}/document`, {
      ...next,
      metadata: document.metadata,
      version: document.version,
    });
  }
}
