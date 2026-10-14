import { useApi } from "@/composables/useApi";
import { rebaseDocument, removedBodyIds, type DocumentState, type TimelineItem } from "@/lib/documentRebase";
import type { Document } from "@/types/api";
import type { Command } from "./Command";

export class HistoryConflictError extends Error {
  constructor(readonly conflicts: string[], direction: "undo" | "redo") {
    const action = direction === "undo" ? "Отменить" : "Повторить";
    super(`${action} нельзя: после операции изменены ${conflicts.join(", ")}. Сначала отмените более поздние правки.`);
    this.name = "HistoryConflictError";
  }
}

function stateOf(document: Document): DocumentState {
  return {
    components: JSON.parse(JSON.stringify(document.components ?? {})),
    timeline: JSON.parse(JSON.stringify(document.timeline ?? [])) as TimelineItem[],
  };
}

export abstract class RecordedCommand implements Command {
  abstract label: string;
  private before: DocumentState | null = null;
  private after: DocumentState | null = null;

  constructor(readonly projectId: string) {}

  protected abstract perform(): Promise<void>;

  protected async afterRestore(): Promise<void> {}

  private async loadState(): Promise<{ document: Document; state: DocumentState }> {
    const document = await useApi().get<Document>(`/projects/${this.projectId}/document`);
    return { document, state: stateOf(document) };
  }

  async execute(): Promise<void> {
    if (this.before && this.after) {
      await this.move(this.before, this.after, "redo");
      return;
    }
    const { state: before } = await this.loadState();
    await this.perform();
    this.before = before;
    this.after = (await this.loadState()).state;
  }

  async undo(): Promise<void> {
    if (!this.before || !this.after) throw new Error("Операция ещё не выполнена: отменять нечего.");
    await this.move(this.after, this.before, "undo");
  }

  private async move(from: DocumentState, to: DocumentState, direction: "undo" | "redo") {
    const { document } = await this.loadState();
    const rebased = rebaseDocument(stateOf(document), from, to);
    if (!rebased.ok) throw new HistoryConflictError(rebased.conflicts, direction);
    await useApi().put<Document>(`/projects/${this.projectId}/document`, {
      ...rebased.state,
      metadata: document.metadata,
      version: document.version,
    });
    const { releaseBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    await Promise.all(removedBodyIds(from, to).map((bodyId) => releaseBrowserShape(bodyId).catch(() => undefined)));
    await this.afterRestore();
  }
}
