import type { Command } from "./Command";
import type { BooleanResponse, Document, MeshData } from "@/types/api";
import type { BrowserBooleanOperation } from "@/lib/browserBoolean";
import { useApi } from "@/composables/useApi";
import { captureSnapshot, restoreSnapshot, type DocumentSnapshot } from "./documentSnapshot";
import { browserBodyForm, newFeatureKey } from "./browserUpload";

export class BrowserBooleanCommand implements Command {
  label = "Булева операция в браузере";

  private snapshot: DocumentSnapshot | null;
  private resultBodyId: string | null = null;
  private resultMesh: MeshData | null = null;
  private featureKey = newFeatureKey();

  constructor(
    private projectId: string,
    private operation: BrowserBooleanOperation,
    private targetBodyId: string,
    private toolBodyId: string,
    private getDoc: () => Document | null,
    private reloadDoc: () => Promise<void>,
    private onMeshRemoved: (bodyId: string) => void,
  ) {
    this.snapshot = captureSnapshot(getDoc());
  }

  async execute(): Promise<void> {
    const { buildBrowserBoolean, discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const browserResult = await buildBrowserBoolean(this.operation, this.targetBodyId, this.toolBodyId, this.featureKey);
    try {
      const form = browserBodyForm(browserResult, "browser-boolean.step", this.featureKey, {
        operation: this.operation,
        target_body_id: this.targetBodyId,
        tool_body_id: this.toolBodyId,
        document_version: String(this.getDoc()?.version ?? this.snapshot?.version ?? 0),
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

  async undo(): Promise<void> {
    if (!this.snapshot || !(await restoreSnapshot(this.projectId, this.snapshot))) return;
    if (this.resultBodyId) {
      this.onMeshRemoved(this.resultBodyId);
      const { releaseBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
      await releaseBrowserShape(this.resultBodyId).catch(() => undefined);
    }
    this.resultBodyId = null;
    this.resultMesh = null;
    await this.reloadDoc();
  }

  getResult(): { bodyId: string; mesh: MeshData } | null {
    if (!this.resultBodyId || !this.resultMesh) return null;
    return { bodyId: this.resultBodyId, mesh: this.resultMesh };
  }
}
