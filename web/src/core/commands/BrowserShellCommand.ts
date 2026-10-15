import type { Document, ExtrudeResponse, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import { shellLabel, type BrowserShellFeature } from "@/lib/browserShell";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

function shellFields(feature: BrowserShellFeature): Record<string, string> {
  return {
    body_id: feature.bodyId,
    face_ids: JSON.stringify(feature.faceNames),
    thickness: String(feature.thickness),
    direction: feature.direction,
  };
}

export class BrowserShellCommand extends RecordedCommand {
  label: string;

  private result: { bodyId: string; mesh: MeshData; hiddenBodyIds: string[] } | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private feature: BrowserShellFeature,
    private getDoc: () => Document | null,
  ) {
    super(projectId);
    this.label = shellLabel(feature.thickness, feature.direction);
  }

  protected async perform(): Promise<void> {
    const { discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const { buildBrowserShell } = await import("@/composables/editor/browserShell");
    const built = await buildBrowserShell(this.feature, this.featureKey);
    try {
      const form = browserBodyForm(built, "browser-shell.step", this.featureKey, {
        ...shellFields(this.feature),
        document_version: String(this.getDoc()?.version ?? 0),
      });
      const saved = await useApi().multipartPost<ExtrudeResponse>(`/projects/${this.projectId}/geometry/browser-shell`, form);
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
