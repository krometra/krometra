import type { Document, ExtrudeResponse, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import type { BrowserExtrudeOptions, BrowserSketchPlacement } from "@/composables/editor/useBrowserGeometry";
import { browserExtrudeForm, browserExtrudeLabel } from "@/lib/browserExtrudeForm";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

export class BrowserExtrudeCommand extends RecordedCommand {
  label = "Выдавить в браузере";

  private resultBodyId: string | null = null;
  private resultMesh: MeshData | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private sketchId: string,
    private placement: BrowserSketchPlacement,
    private options: BrowserExtrudeOptions,
    private documentVersion: number,
    private getDoc: () => Document | null,
    private onMeshRemoved: (bodyId: string) => void,
  ) {
    super(projectId);
  }

  protected async perform(): Promise<void> {
    const { buildBrowserExtrude, discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const browserResult = await buildBrowserExtrude({ ...this.placement, ...this.options }, this.featureKey);
    try {
      const form = browserBodyForm(browserResult, "browser-extrude.step", this.featureKey, {
        sketch_id: this.sketchId,
        ...browserExtrudeForm(this.options),
        document_version: String(this.getDoc()?.version ?? this.documentVersion),
      });
      const api = useApi();
      const result = await api.multipartPost<ExtrudeResponse>(
        `/projects/${this.projectId}/geometry/browser-extrude`,
        form,
      );
      this.resultBodyId = result.body_id;
      this.resultMesh = result.mesh;
      (result.hidden_body_ids ?? []).forEach((bodyId) => this.onMeshRemoved(bodyId));
      await retainBrowserShape(browserResult.shapeHandle, result.body_id).catch(() => undefined);
      this.label = browserExtrudeLabel(this.options);
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
