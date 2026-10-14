import type { Document, ImportResponse, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import { browserImportForm } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

export interface ImportedBody {
  bodyId: string;
  mesh: MeshData;
}

export class BrowserImportCommand extends RecordedCommand {
  label = "Импорт STEP";

  private imported: ImportedBody[] = [];

  constructor(
    projectId: string,
    private fileName: string,
    private file: ArrayBuffer,
    private getDoc: () => Document | null,
  ) {
    super(projectId);
  }

  protected async perform(): Promise<void> {
    const { discardBrowserShape, importBrowserStep, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const bodies = await importBrowserStep(this.file.slice(0));
    try {
      const saved = await useApi().multipartPost<ImportResponse>(
        `/projects/${this.projectId}/geometry/browser-import`,
        browserImportForm(this.fileName, this.getDoc()?.version ?? 0, bodies),
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


  getResult(): ImportedBody[] {
    return this.imported;
  }
}
