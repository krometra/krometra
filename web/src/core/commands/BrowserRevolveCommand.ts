import type { Command } from "./Command";
import type { Document, MeshData, PlaneBasis, SketchEntity, SketchPlane } from "@/types/api";
import { useApi } from "@/composables/useApi";
import { captureSnapshot, restoreSnapshot, type DocumentSnapshot } from "./documentSnapshot";
import { browserBodyForm, newFeatureKey } from "./browserUpload";

export class BrowserRevolveCommand implements Command {
  label = "Вращать в браузере";
  private snapshot: DocumentSnapshot | null;
  private resultBodyId: string | null = null;
  private resultMesh: MeshData | null = null;
  private featureKey = newFeatureKey();

  constructor(
    private projectId: string, private sketchId: string, private entities: SketchEntity[], private plane: SketchPlane,
    private planeOffset: number, private planeBasis: PlaneBasis | null, private axisOrigin: { x: number; y: number },
    private axis: "x" | "y", private angle: number, private direction: "one_side" | "symmetric", private documentVersion: number,
    private getDoc: () => Document | null, private reloadDoc: () => Promise<void>, private onMeshRemoved: (bodyId: string) => void,
  ) { this.snapshot = captureSnapshot(getDoc()); }

  async execute() {
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

  async undo() {
    if (!this.snapshot || !(await restoreSnapshot(this.projectId, this.snapshot))) return;
    if (this.resultBodyId) {
      this.onMeshRemoved(this.resultBodyId);
      const { releaseBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
      await releaseBrowserShape(this.resultBodyId).catch(() => undefined);
    }
    this.resultBodyId = null; this.resultMesh = null; await this.reloadDoc();
  }

  getResult() { return this.resultBodyId && this.resultMesh ? { bodyId: this.resultBodyId, mesh: this.resultMesh } : null; }
}
