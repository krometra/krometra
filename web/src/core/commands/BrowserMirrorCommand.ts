import type { Document, ExtrudeResponse, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import { mirrorFormFields, mirrorLabel, type MirrorPlane } from "@/lib/mirrorPlane";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

export class BrowserMirrorCommand extends RecordedCommand {
  label: string;

  private result: { bodyId: string; mesh: MeshData; hiddenBodyIds: string[] } | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private bodyId: string,
    private plane: MirrorPlane,
    private merge: boolean,
    private getDoc: () => Document | null,
  ) {
    super(projectId);
    this.label = mirrorLabel(plane, merge);
  }

  protected async perform(): Promise<void> {
    const { buildBrowserMirror } = await import("@/composables/editor/browserMirror");
    const { discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const built = await buildBrowserMirror(this.bodyId, this.plane, this.merge, this.featureKey);
    try {
      const fields = mirrorFormFields(this.bodyId, this.plane, this.merge, this.getDoc()?.version ?? 0);
      const form = browserBodyForm(built, "browser-mirror.step", this.featureKey, fields);
      const saved = await useApi().multipartPost<ExtrudeResponse>(`/projects/${this.projectId}/geometry/browser-mirror`, form);
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
