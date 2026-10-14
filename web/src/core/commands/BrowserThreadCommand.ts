import type { Document, MeshData, ThreadResponse } from "@/types/api";
import type { BrowserThreadFace, BrowserThreadResult } from "@/composables/editor/browserThread";
import { threadLabel } from "@/lib/threadGeometry";
import { useApi } from "@/composables/useApi";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

export interface ThreadParams {
  pitch: number;
  depth?: number | null;
  length?: number | null;
  offset: number;
  crestRatio: number;
  starts: number;
  rightHanded: boolean;
}

export class BrowserThreadCommand extends RecordedCommand {
  label = "Резьба в браузере";

  private resultBodyId: string | null = null;
  private resultMesh: MeshData | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private face: BrowserThreadFace,
    private params: ThreadParams,
    private getDoc: () => Document | null,
  ) {
    super(projectId);
  }

  private threadForm(built: BrowserThreadResult) {
    return browserBodyForm(built, "browser-thread.step", this.featureKey, {
      body_id: this.face.bodyId,
      face_id: String(this.face.faceId),
      pitch: String(this.params.pitch),
      depth: String(built.depth),
      length: String(built.length),
      offset: String(this.params.offset),
      crest_ratio: String(this.params.crestRatio),
      starts: String(this.params.starts),
      right_handed: String(this.params.rightHanded),
      external: String(built.cylinder.external),
      diameter: String(built.cylinder.radius * 2),
      document_version: String(this.getDoc()?.version ?? 0),
    });
  }

  protected async perform(): Promise<void> {
    const { buildBrowserThread } = await import("@/composables/editor/browserThread");
    const { discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const built = await buildBrowserThread(this.face, this.params, this.featureKey);
    try {
      const form = this.threadForm(built);
      const result = await useApi().multipartPost<ThreadResponse>(`/projects/${this.projectId}/geometry/browser-thread`, form);
      this.resultBodyId = result.body_id;
      this.resultMesh = result.mesh;
      this.label = threadLabel(result.external, result.diameter, result.pitch, result.starts);
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
