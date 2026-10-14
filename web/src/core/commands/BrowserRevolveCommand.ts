import type { Document, MeshData, PlaneBasis, SketchEntity, SketchPlane } from "@/types/api";
import { useApi } from "@/composables/useApi";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

export class BrowserRevolveCommand extends RecordedCommand {
  label = "Вращать в браузере";
  private resultBodyId: string | null = null;
  private resultMesh: MeshData | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string, private sketchId: string, private entities: SketchEntity[], private plane: SketchPlane,
    private planeOffset: number, private planeBasis: PlaneBasis | null, private axisOrigin: { x: number; y: number },
    private axis: "x" | "y", private angle: number, private direction: "one_side" | "symmetric", private documentVersion: number,
    private getDoc: () => Document | null,
  ) { super(projectId); }

  protected async perform() {
    const { buildBrowserRevolve, discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const result = await buildBrowserRevolve({ entities: this.entities, plane: this.plane, planeOffset: this.planeOffset, planeBasis: this.planeBasis, axisOrigin: this.axisOrigin, axis: this.axis, angle: this.angle, direction: this.direction }, this.featureKey);
    try {
      const form = browserBodyForm(result, "browser-revolve.step", this.featureKey, {
        sketch_id: this.sketchId,
        axis_origin: JSON.stringify(this.axisOrigin),
        axis: this.axis,
        angle: String(this.angle),
        direction: this.direction,
        document_version: String(this.getDoc()?.version ?? this.documentVersion),
      });
      const saved = await useApi().multipartPost<{ body_id: string; mesh: MeshData }>(`/projects/${this.projectId}/geometry/browser-revolve`, form);
      this.resultBodyId = saved.body_id; this.resultMesh = saved.mesh;
      await retainBrowserShape(result.shapeHandle, saved.body_id).catch(() => undefined);
    } catch (error) { await discardBrowserShape(result.shapeHandle).catch(() => undefined); throw error; }
  }


  getResult() { return this.resultBodyId && this.resultMesh ? { bodyId: this.resultBodyId, mesh: this.resultMesh } : null; }
}
