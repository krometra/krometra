import type { BooleanResponse, Document, MeshData } from "@/types/api";
import type { BrowserBooleanOperation } from "@/lib/browserBoolean";
import { useApi } from "@/composables/useApi";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

export class BrowserBooleanCommand extends RecordedCommand {
  label = "Булева операция в браузере";

  private resultBodyId: string | null = null;
  private resultMesh: MeshData | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private operation: BrowserBooleanOperation,
    private targetBodyId: string,
    private toolBodyId: string,
    private getDoc: () => Document | null,
  ) {
    super(projectId);
  }

  protected async perform(): Promise<void> {
    const { buildBrowserBoolean, discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const browserResult = await buildBrowserBoolean(this.operation, this.targetBodyId, this.toolBodyId, this.featureKey);
    try {
      const form = browserBodyForm(browserResult, "browser-boolean.step", this.featureKey, {
        operation: this.operation,
        target_body_id: this.targetBodyId,
        tool_body_id: this.toolBodyId,
        document_version: String(this.getDoc()?.version ?? 0),
      });
      const result = await useApi().multipartPost<BooleanResponse>(
        `/projects/${this.projectId}/geometry/browser-boolean`,
        form,
      );
      this.resultBodyId = result.result_body_id;
      this.resultMesh = result.mesh;
      await retainBrowserShape(browserResult.shapeHandle, result.result_body_id).catch(() => undefined);
    } catch (error) {
      await discardBrowserShape(browserResult.shapeHandle).catch(() => undefined);
      throw error;
    }
  }


  getResult(): { bodyId: string; mesh: MeshData } | null {
    if (!this.resultBodyId || !this.resultMesh) return null;
    return { bodyId: this.resultBodyId, mesh: this.resultMesh };
  }
}
