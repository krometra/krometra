import type { Document, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import type { BrowserExtrudeOptions, BrowserSketchPlacement, BrowserTargetCut } from "@/composables/editor/useBrowserGeometry";
import { browserExtrudeCutsForm } from "@/lib/browserExtrudeForm";
import { browserBodiesForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

interface ExtrudeCutsResponse {
  bodies: { body_id: string; mesh: MeshData }[];
  hidden_body_ids: string[];
}

export class BrowserExtrudeCutsCommand extends RecordedCommand {
  label = "Вырез по нескольким телам";

  private result: { bodyId: string; mesh: MeshData }[] = [];
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private sketchId: string,
    private placement: BrowserSketchPlacement,
    private options: BrowserExtrudeOptions,
    private targetBodyIds: string[],
    private getDoc: () => Document | null,
    private onMeshRemoved: (bodyId: string) => void,
  ) {
    super(projectId);
  }

  private save(cuts: BrowserTargetCut[]): Promise<ExtrudeCutsResponse> {
    const form = browserBodiesForm("browser-extrude-cut", {
      sketch_id: this.sketchId,
      ...browserExtrudeCutsForm(this.options, cuts.map((cut) => cut.targetBodyId)),
      feature_key: this.featureKey,
      document_version: String(this.getDoc()?.version ?? 0),
    }, cuts);
    return useApi().multipartPost<ExtrudeCutsResponse>(`/projects/${this.projectId}/geometry/browser-extrude-cuts`, form);
  }

  protected async perform(): Promise<void> {
    const { buildBrowserExtrudeCuts, discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const cuts = await buildBrowserExtrudeCuts({ ...this.placement, ...this.options }, this.targetBodyIds, this.featureKey);
    try {
      const saved = await this.save(cuts);
      saved.hidden_body_ids.forEach((bodyId) => this.onMeshRemoved(bodyId));
      this.result = saved.bodies.map((body) => ({ bodyId: body.body_id, mesh: body.mesh }));
      await Promise.all(saved.bodies.map((body, index) => retainBrowserShape(cuts[index].shapeHandle, body.body_id).catch(() => undefined)));
    } catch (error) {
      await Promise.all(cuts.map((cut) => discardBrowserShape(cut.shapeHandle).catch(() => undefined)));
      throw error;
    }
  }

  getResult(): { bodyId: string; mesh: MeshData }[] {
    return this.result;
  }
}
