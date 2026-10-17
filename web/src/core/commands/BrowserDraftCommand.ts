import type { Document, ExtrudeResponse, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import { draftFormFields, draftLabel, type BrowserDraftFeature } from "@/lib/browserDraft";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

export class BrowserDraftCommand extends RecordedCommand {
  label: string;

  private result: { bodyId: string; mesh: MeshData; hiddenBodyIds: string[] } | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private feature: BrowserDraftFeature,
    private getDoc: () => Document | null,
  ) {
    super(projectId);
    this.label = draftLabel(feature.angleDeg, feature.neutral);
  }

  protected async perform(): Promise<void> {
    const { discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const { buildBrowserDraft } = await import("@/composables/editor/browserDraft");
    const built = await buildBrowserDraft(this.feature, this.featureKey);
    try {
      const form = browserBodyForm(built, "browser-draft.step", this.featureKey, draftFormFields(this.feature, this.getDoc()?.version ?? 0));
      const saved = await useApi().multipartPost<ExtrudeResponse>(`/projects/${this.projectId}/geometry/browser-draft`, form);
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
