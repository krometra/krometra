import type { Document, ExtrudeResponse, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import { transformLabel, type BodyTransform } from "@/lib/bodyTransform";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

export class BrowserTransformCommand extends RecordedCommand {
  label: string;

  private result: { bodyId: string; mesh: MeshData; hiddenBodyIds: string[] } | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private bodyId: string,
    private transform: BodyTransform,
    private copy: boolean,
    private getDoc: () => Document | null,
  ) {
    super(projectId);
    this.label = transformLabel(transform, copy);
  }

  protected async perform(): Promise<void> {
    const { buildBrowserTransform, discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const built = await buildBrowserTransform(this.bodyId, this.transform, this.featureKey);
    try {
      const form = browserBodyForm(built, "browser-transform.step", this.featureKey, {
        body_id: this.bodyId,
        translate: JSON.stringify(this.transform.translate),
        rotate: JSON.stringify(this.transform.rotate),
        keep_source: String(this.copy),
        document_version: String(this.getDoc()?.version ?? 0),
      });
      const saved = await useApi().multipartPost<ExtrudeResponse>(`/projects/${this.projectId}/geometry/browser-transform`, form);
      this.result = { bodyId: saved.body_id, mesh: saved.mesh, hiddenBodyIds: saved.hidden_body_ids ?? [] };
      await retainBrowserShape(built.shapeHandle, saved.body_id).catch(() => undefined);
    } catch (error) {
      await discardBrowserShape(built.shapeHandle).catch(() => undefined);
      throw error;
    }
  }

  getResult() {
    return this.result;
  }
}
