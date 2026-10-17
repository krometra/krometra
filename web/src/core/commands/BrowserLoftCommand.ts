import type { Document, ExtrudeResponse, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import type { BrowserLoftOptions } from "@/composables/editor/useBrowserGeometry";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

export class BrowserLoftCommand extends RecordedCommand {
  label = "Лофт";

  private resultBodyId: string | null = null;
  private resultMesh: MeshData | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private profileSketchIds: string[],
    private options: BrowserLoftOptions,
    private documentVersion: number,
    private getDoc: () => Document | null,
    private onMeshRemoved: (bodyId: string) => void,
  ) {
    super(projectId);
  }

  protected async perform(): Promise<void> {
    const { buildBrowserLoft, discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const built = await buildBrowserLoft(this.options, this.featureKey);
    try {
      const form = browserBodyForm(built, "browser-loft.step", this.featureKey, {
        profile_sketch_ids: JSON.stringify(this.profileSketchIds),
        transition: this.options.ruled ? "ruled" : "smooth",
        operation: this.options.operation,
        ...(this.options.targetBodyId ? { target_body_id: this.options.targetBodyId } : {}),
        document_version: String(this.getDoc()?.version ?? this.documentVersion),
      });
      const result = await useApi().multipartPost<ExtrudeResponse>(`/projects/${this.projectId}/geometry/browser-loft`, form);
      this.resultBodyId = result.body_id;
      this.resultMesh = result.mesh;
      (result.hidden_body_ids ?? []).forEach((bodyId) => this.onMeshRemoved(bodyId));
      await retainBrowserShape(built.shapeHandle, result.body_id).catch(() => undefined);
    } catch (error) {
      await discardBrowserShape(built.shapeHandle).catch(() => undefined);
      throw error;
    }
  }

  getResult(): { bodyId: string; mesh: MeshData } | null {
    if (!this.resultBodyId || !this.resultMesh) return null;
    return { bodyId: this.resultBodyId, mesh: this.resultMesh };
  }
}
