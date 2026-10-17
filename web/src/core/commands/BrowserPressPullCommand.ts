import type { Document, ExtrudeResponse, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import { pressPullLabel, type BrowserPressPullFeature } from "@/lib/browserPressPull";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

function pressPullFields(feature: BrowserPressPullFeature, version: number): Record<string, string> {
  return {
    body_id: feature.bodyId,
    face_ids: JSON.stringify(feature.faceNames),
    distance: String(feature.distance),
    new_body: String(feature.newBody),
    document_version: String(version),
  };
}

export class BrowserPressPullCommand extends RecordedCommand {
  label: string;

  private result: { bodyId: string; mesh: MeshData; hiddenBodyIds: string[] } | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private feature: BrowserPressPullFeature,
    private getDoc: () => Document | null,
  ) {
    super(projectId);
    this.label = pressPullLabel(feature.distance, feature.newBody);
  }

  protected async perform(): Promise<void> {
    const { discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const { buildBrowserPressPull } = await import("@/composables/editor/browserPressPull");
    const built = await buildBrowserPressPull(this.feature, this.featureKey);
    try {
      const fields = pressPullFields(this.feature, this.getDoc()?.version ?? 0);
      const form = browserBodyForm(built, "browser-press-pull.step", this.featureKey, fields);
      const saved = await useApi().multipartPost<ExtrudeResponse>(`/projects/${this.projectId}/geometry/browser-press-pull`, form);
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
