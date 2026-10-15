import type { Document, ExtrudeResponse, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import type { BrowserSketchPlacement, BrowserSweepOptions } from "@/composables/editor/useBrowserGeometry";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

export interface BrowserSweepSketches {
  profileSketchId: string;
  pathSketchId: string;
}

export class BrowserSweepCommand extends RecordedCommand {
  label = "Протянуть по траектории";

  private resultBodyId: string | null = null;
  private resultMesh: MeshData | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private sketches: BrowserSweepSketches,
    private profile: BrowserSketchPlacement,
    private options: BrowserSweepOptions,
    private documentVersion: number,
    private getDoc: () => Document | null,
    private onMeshRemoved: (bodyId: string) => void,
  ) {
    super(projectId);
  }

  protected async perform(): Promise<void> {
    const { buildBrowserSweep, discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const built = await buildBrowserSweep({ ...this.profile, ...this.options }, this.featureKey);
    try {
      const form = browserBodyForm(built, "browser-sweep.step", this.featureKey, {
        sketch_id: this.sketches.profileSketchId,
        path_sketch_id: this.sketches.pathSketchId,
        orientation: this.options.orientation,
        operation: this.options.operation,
        ...(this.options.targetBodyId ? { target_body_id: this.options.targetBodyId } : {}),
        document_version: String(this.getDoc()?.version ?? this.documentVersion),
      });
      const result = await useApi().multipartPost<ExtrudeResponse>(`/projects/${this.projectId}/geometry/browser-sweep`, form);
      this.resultBodyId = result.body_id;
      this.resultMesh = result.mesh;
      (result.hidden_body_ids ?? []).forEach((bodyId) => this.onMeshRemoved(bodyId));
      await retainBrowserShape(built.shapeHandle, result.body_id).catch(() => undefined);
    } catch (error) {
      await discardBrowserShape(built.shapeHandle).catch(() => undefined);
      throw error;
    }
  }

  getResult(): { bodyId: string; mesh: MeshData } | null {
    if (!this.resultBodyId || !this.resultMesh) return null;
    return { bodyId: this.resultBodyId, mesh: this.resultMesh };
  }
}
