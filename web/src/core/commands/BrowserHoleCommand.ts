import type { Document, HoleResponse, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import { holeLabel, holeParamsOf, type HoleTarget } from "@/lib/holeFeature";
import type { HoleSpec } from "@/lib/holeGeometry";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

export class BrowserHoleCommand extends RecordedCommand {
  label: string;

  private result: { bodyId: string; mesh: MeshData } | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private target: HoleTarget,
    private spec: HoleSpec,
    private getDoc: () => Document | null,
  ) {
    super(projectId);
    this.label = holeLabel(spec, target.centers.length);
  }

  private holeForm(built: Parameters<typeof browserBodyForm>[0]) {
    const params = Object.fromEntries(Object.entries(holeParamsOf(this.spec)).map(([key, value]) => [key, String(value)]));
    return browserBodyForm(built, "browser-hole.step", this.featureKey, {
      ...params,
      body_id: this.target.bodyId,
      face_id: String(this.target.faceId),
      centers: JSON.stringify(this.target.centers),
      ...(this.target.sketch ? { sketch_id: this.target.sketch.sketchId } : {}),
      document_version: String(this.getDoc()?.version ?? 0),
    });
  }

  protected async perform(): Promise<void> {
    const { buildBrowserHole } = await import("@/composables/editor/browserHole");
    const { discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const built = await buildBrowserHole(this.target, this.spec, this.featureKey);
    try {
      const saved = await useApi().multipartPost<HoleResponse>(`/projects/${this.projectId}/geometry/browser-hole`, this.holeForm(built));
      this.result = { bodyId: saved.body_id, mesh: saved.mesh };
      await retainBrowserShape(built.shapeHandle, saved.body_id).catch(() => undefined);
    } catch (error) {
      await discardBrowserShape(built.shapeHandle).catch(() => undefined);
      throw error;
    }
  }

  getResult(): { bodyId: string; mesh: MeshData } | null {
    return this.result;
  }
}
