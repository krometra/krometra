import type { Command } from "./Command";
import type { Document, ExtrudeResponse, MeshData } from "@/types/api";
import { useApi } from "@/composables/useApi";
import type { BrowserExtrudeOptions, BrowserSketchPlacement } from "@/composables/editor/useBrowserGeometry";
import { browserExtrudeForm, browserExtrudeLabel } from "@/lib/browserExtrudeForm";
import { captureSnapshot, restoreSnapshot, type DocumentSnapshot } from "./documentSnapshot";
import { browserBodyForm, newFeatureKey } from "./browserUpload";

export class BrowserExtrudeCommand implements Command {
  label = "Выдавить в браузере";

  private snapshot: DocumentSnapshot | null;
  private resultBodyId: string | null = null;
  private resultMesh: MeshData | null = null;
  private featureKey = newFeatureKey();

  constructor(
    private projectId: string,
    private sketchId: string,
    private placement: BrowserSketchPlacement,
    private options: BrowserExtrudeOptions,
    private documentVersion: number,
    private getDoc: () => Document | null,
    private reloadDoc: () => Promise<void>,
    private onMeshRemoved: (bodyId: string) => void,
  ) {
    this.snapshot = captureSnapshot(getDoc());
  }

  async execute(): Promise<void> {
    const { buildBrowserExtrude, discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const browserResult = await buildBrowserExtrude({ ...this.placement, ...this.options }, this.featureKey);
    try {
      const form = browserBodyForm(browserResult, "browser-extrude.step", this.featureKey, {
        sketch_id: this.sketchId,
        ...browserExtrudeForm(this.options),
        document_version: String(this.getDoc()?.version ?? this.documentVersion),
      });
      const api = useApi();
      const result = await api.multipartPost<ExtrudeResponse>(
        `/projects/${this.projectId}/geometry/browser-extrude`,
        form,
      );
      this.resultBodyId = result.body_id;
      this.resultMesh = result.mesh;
      (result.hidden_body_ids ?? []).forEach((bodyId) => this.onMeshRemoved(bodyId));
      await retainBrowserShape(browserResult.shapeHandle, result.body_id).catch(() => undefined);
      this.label = browserExtrudeLabel(this.options);
    } catch (error) {
      await discardBrowserShape(browserResult.shapeHandle).catch(() => undefined);
      throw error;
    }
  }

  async undo(): Promise<void> {
    if (!this.snapshot || !(await restoreSnapshot(this.projectId, this.snapshot))) return;
    if (this.resultBodyId) {
      this.onMeshRemoved(this.resultBodyId);
      const { releaseBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
      await releaseBrowserShape(this.resultBodyId).catch(() => undefined);
    }
    this.resultBodyId = null;
    this.resultMesh = null;
    await this.reloadDoc();
  }

  getResult(): { bodyId: string; mesh: MeshData } | null {
    if (!this.resultBodyId || !this.resultMesh) return null;
    return { bodyId: this.resultBodyId, mesh: this.resultMesh };
  }
}
