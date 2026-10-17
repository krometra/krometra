import type { Document, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import type { BrowserRevolveOptions, BrowserSketchPlacement } from "@/composables/editor/useBrowserGeometry";
import { profileRegionsField } from "@/lib/browserExtrudeForm";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

export class BrowserRevolveCommand extends RecordedCommand {
  label = "Вращать в браузере";
  private resultBodyId: string | null = null;
  private resultMesh: MeshData | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private sketchId: string,
    private placement: BrowserSketchPlacement,
    private options: BrowserRevolveOptions,
    private documentVersion: number,
    private getDoc: () => Document | null,
  ) { super(projectId); }

  protected async perform() {
    const { buildBrowserRevolve, discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const result = await buildBrowserRevolve({ ...this.placement, ...this.options }, this.featureKey);
    try {
      const form = browserBodyForm(result, "browser-revolve.step", this.featureKey, {
        sketch_id: this.sketchId,
        axis_origin: JSON.stringify(this.options.axisOrigin),
        axis: this.options.axis,
        angle: String(this.options.angle),
        direction: this.options.direction,
        ...profileRegionsField(this.options.profileRegions),
        document_version: String(this.getDoc()?.version ?? this.documentVersion),
      });
      const saved = await useApi().multipartPost<{ body_id: string; mesh: MeshData }>(`/projects/${this.projectId}/geometry/browser-revolve`, form);
      this.resultBodyId = saved.body_id; this.resultMesh = saved.mesh;
      await retainBrowserShape(result.shapeHandle, saved.body_id).catch(() => undefined);
    } catch (error) { await discardBrowserShape(result.shapeHandle).catch(() => undefined); throw error; }
  }

  getResult() { return this.resultBodyId && this.resultMesh ? { bodyId: this.resultBodyId, mesh: this.resultMesh } : null; }
}
