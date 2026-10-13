import type { Command } from "./Command";
import type { Document, ImportResponse, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import { browserImportForm } from "./browserUpload";
import { captureSnapshot, restoreSnapshot, type DocumentSnapshot } from "./documentSnapshot";

export interface ImportedBody {
  bodyId: string;
  mesh: MeshData;
}

export class BrowserImportCommand implements Command {
  label = "Импорт STEP";

  private snapshot: DocumentSnapshot | null;
  private imported: ImportedBody[] = [];

  constructor(
    private projectId: string,
    private fileName: string,
    private file: ArrayBuffer,
    private getDoc: () => Document | null,
    private reloadDoc: () => Promise<void>,
    private onMeshRemoved: (bodyId: string) => void,
  ) {
    this.snapshot = captureSnapshot(getDoc());
  }

  async execute(): Promise<void> {
    const { discardBrowserShape, importBrowserStep, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const bodies = await importBrowserStep(this.file.slice(0));
    try {
      const saved = await useApi().multipartPost<ImportResponse>(
        `/projects/${this.projectId}/geometry/browser-import`,
        browserImportForm(this.fileName, this.getDoc()?.version ?? this.snapshot?.version ?? 0, bodies),
      );
      if (saved.bodies.length !== bodies.length) throw new Error("Сервер сохранил не все импортированные тела. Обновите страницу.");
      this.imported = saved.bodies.map((body) => ({ bodyId: body.body_id, mesh: body.mesh }));
      await Promise.all(bodies.map((body, index) => retainBrowserShape(body.shapeHandle, saved.bodies[index].body_id).catch(() => undefined)));
      this.label = `Импорт STEP: ${this.fileName}`;
    } catch (error) {
      await Promise.all(bodies.map((body) => discardBrowserShape(body.shapeHandle).catch(() => undefined)));
      throw error;
    }
  }

  async undo(): Promise<void> {
    if (!this.snapshot || !(await restoreSnapshot(this.projectId, this.snapshot))) return;
    const { releaseBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    for (const body of this.imported) {
      this.onMeshRemoved(body.bodyId);
      await releaseBrowserShape(body.bodyId).catch(() => undefined);
    }
    this.imported = [];
    await this.reloadDoc();
  }

  getResult(): ImportedBody[] {
    return this.imported;
  }
}
