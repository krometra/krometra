import type { Document, MeshData } from "@/types/api";
import type { BrowserBuildResult } from "@/composables/editor/useBrowserGeometry";
import { useApi } from "@/composables/useApi";
import { patternInstances, type PatternMode, type PatternSpec } from "@/lib/bodyPattern";
import { patternLabel, patternTimelineParams } from "@/lib/bodyPatternParams";
import { browserBodiesForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

interface PatternResponse {
  bodies: { body_id: string; mesh: MeshData }[];
  hidden_body_ids: string[];
}

export interface PatternResult {
  bodies: { bodyId: string; mesh: MeshData }[];
  hiddenBodyIds: string[];
}

export class BrowserPatternCommand extends RecordedCommand {
  label: string;

  private result: PatternResult | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private bodyId: string,
    private pattern: PatternSpec,
    private mode: PatternMode,
    private getDoc: () => Document | null,
  ) {
    super(projectId);
    this.label = patternLabel(pattern, mode);
  }

  private async save(built: BrowserBuildResult[]): Promise<PatternResponse> {
    const form = browserBodiesForm("browser-pattern", {
      body_id: this.bodyId,
      pattern: JSON.stringify(patternTimelineParams(this.pattern, this.mode)),
      feature_key: this.featureKey,
      document_version: String(this.getDoc()?.version ?? 0),
    }, built);
    return useApi().multipartPost<PatternResponse>(`/projects/${this.projectId}/geometry/browser-pattern`, form);
  }

  protected async perform(): Promise<void> {
    const { buildBrowserPattern, discardBrowserShape, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const built: BrowserBuildResult[] = [];
    try {
      for (const instance of patternInstances(this.pattern, this.mode)) {
        built.push(await buildBrowserPattern(this.bodyId, this.pattern, this.mode, instance, this.featureKey));
      }
      const saved = await this.save(built);
      this.result = { bodies: saved.bodies.map((body) => ({ bodyId: body.body_id, mesh: body.mesh })), hiddenBodyIds: saved.hidden_body_ids };
      await Promise.all(saved.bodies.map((body, index) => retainBrowserShape(built[index].shapeHandle, body.body_id).catch(() => undefined)));
    } catch (error) {
      await Promise.all(built.map((body) => discardBrowserShape(body.shapeHandle).catch(() => undefined)));
      throw error;
    }
  }

  getResult(): PatternResult | null {
    return this.result;
  }
}
