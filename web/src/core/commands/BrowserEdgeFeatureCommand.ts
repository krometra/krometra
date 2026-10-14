import type { Document, ExtrudeResponse, MeshData } from "@/types/api";
import type { BrowserBuildResult, BrowserEdgeFeature } from "@/composables/editor/useBrowserGeometry";
import { filletMergePlan } from "@/lib/browserFilletRun";
import { useApi } from "@/composables/useApi";
import { browserBodyForm, newFeatureKey } from "./browserUpload";
import { RecordedCommand } from "./RecordedCommand";

function featureFields(feature: BrowserEdgeFeature): Record<string, string> {
  const common = { body_id: feature.bodyId, edge_ids: JSON.stringify(feature.edgeNames) };
  if (feature.kind === "fillet") return { ...common, radius: String(feature.radius) };
  return { ...common, distance1: String(feature.distance1), distance2: String(feature.distance2) };
}

export function edgeFeatureLabel(feature: BrowserEdgeFeature): string {
  if (feature.kind === "fillet") return `Скругление R${feature.radius}мм`;
  return feature.distance1 === feature.distance2
    ? `Фаска ${feature.distance1}мм`
    : `Фаска ${feature.distance1}×${feature.distance2}мм`;
}

type BrowserGeometry = typeof import("@/composables/editor/useBrowserGeometry");

interface BuiltFeature {
  built: BrowserBuildResult;
  endpoint: string;
  featureKey: string;
  fields: Record<string, string>;
}

export class BrowserEdgeFeatureCommand extends RecordedCommand {
  label: string;

  private resultBodyId: string | null = null;
  private resultMesh: MeshData | null = null;
  private featureKey = newFeatureKey();

  constructor(
    projectId: string,
    private feature: BrowserEdgeFeature,
    private getDoc: () => Document | null,
    private onMeshRemoved: (bodyId: string) => void,
  ) {
    super(projectId);
    this.label = edgeFeatureLabel(feature);
  }

  protected async perform(): Promise<void> {
    const geometry = await import("@/composables/editor/useBrowserGeometry");
    const { built, endpoint, featureKey, fields } = await this.build(geometry);
    try {
      const form = browserBodyForm(built, `browser-${this.feature.kind}.step`, featureKey, {
        ...fields,
        document_version: String(this.getDoc()?.version ?? 0),
      });
      const result = await useApi().multipartPost<ExtrudeResponse>(`/projects/${this.projectId}/geometry/${endpoint}`, form);
      this.resultBodyId = result.body_id;
      this.resultMesh = result.mesh;
      (result.hidden_body_ids ?? []).forEach((bodyId) => this.onMeshRemoved(bodyId));
      await geometry.retainBrowserShape(built.shapeHandle, result.body_id).catch(() => undefined);
    } catch (error) {
      await geometry.discardBrowserShape(built.shapeHandle).catch(() => undefined);
      throw error;
    }
  }

  private async build(geometry: BrowserGeometry): Promise<BuiltFeature> {
    try {
      const built = await geometry.buildBrowserEdgeFeature(this.feature, this.featureKey);
      return { built, endpoint: `browser-${this.feature.kind}`, featureKey: this.featureKey, fields: featureFields(this.feature) };
    } catch (error) {
      const merged = await this.buildMergedFillet(geometry).catch(() => null);
      if (!merged) throw error;
      return merged;
    }
  }

  private async buildMergedFillet(geometry: BrowserGeometry): Promise<BuiltFeature | null> {
    const feature = this.feature;
    const doc = this.getDoc();
    if (feature.kind !== "fillet" || !doc) return null;
    const plan = filletMergePlan(doc.timeline ?? [], feature);
    if (!plan) return null;
    const built = await geometry.buildBrowserFilletMerge(plan, feature.radius);
    return {
      built,
      endpoint: "browser-fillet-merge",
      featureKey: plan.featureKey,
      fields: {
        entry_ids: JSON.stringify(plan.entryIds),
        edge_ids: JSON.stringify(built.edgeNames),
        radius: String(feature.radius),
      },
    };
  }


  getResult(): { bodyId: string; mesh: MeshData } | null {
    if (!this.resultBodyId || !this.resultMesh) return null;
    return { bodyId: this.resultBodyId, mesh: this.resultMesh };
  }
}
