import type { Command } from "./Command";
import type { Document, MeshData } from "@/types/api";
import type { BrowserRebuiltBody, BrowserSeatedSketch } from "@/composables/editor/useBrowserGeometry";
import { useApi } from "@/composables/useApi";
import { browserRebuildPlan } from "@/lib/browserRebuildPlan";

interface RebuildResponse {
  bodies: { body_id: string; mesh: MeshData }[];
}

function sketchPlanesPayload(sketchPlanes: BrowserSeatedSketch[]) {
  return Object.fromEntries(sketchPlanes.map((seat) => [
    seat.sketchId,
    { plane: seat.plane, plane_offset: seat.planeOffset, plane_basis: seat.planeBasis },
  ]));
}

export function browserRebuildForm(
  entryId: string,
  params: Record<string, unknown>,
  version: number,
  bodies: BrowserRebuiltBody[],
  sketchPlanes: BrowserSeatedSketch[],
): FormData {
  const form = new FormData();
  form.set("entry_id", entryId);
  form.set("params", JSON.stringify(params));
  form.set("document_version", String(version));
  form.set("bodies", JSON.stringify(bodies.map((body) => body.bodyId)));
  form.set("sketch_planes", JSON.stringify(sketchPlanesPayload(sketchPlanes)));
  for (const body of bodies) {
    form.set(`step:${body.bodyId}`, new Blob([body.step], { type: "application/step" }), `${body.bodyId}.step`);
    form.set(`mesh:${body.bodyId}`, JSON.stringify(body.mesh));
    form.set(`naming:${body.bodyId}`, JSON.stringify(body.naming));
  }
  return form;
}

export class BrowserRebuildCommand implements Command {
  label = "Изменить параметры";

  constructor(
    private projectId: string,
    private entryId: string,
    private oldParams: Record<string, unknown>,
    private newParams: Record<string, unknown>,
    private onMeshUpdated: (bodyId: string, mesh: MeshData) => void,
  ) {}

  private async apply(params: Record<string, unknown>): Promise<void> {
    const api = useApi();
    const document = await api.get<Document>(`/projects/${this.projectId}/document`);
    const steps = browserRebuildPlan(document, this.entryId, params);
    const { discardBrowserShape, rebuildBrowserHistory, retainBrowserShape } = await import("@/composables/editor/useBrowserGeometry");
    const { bodies, sketchPlanes } = await rebuildBrowserHistory(steps);
    try {
      const saved = await api.multipartPost<RebuildResponse>(
        `/projects/${this.projectId}/geometry/browser-rebuild`,
        browserRebuildForm(this.entryId, params, document.version, bodies, sketchPlanes),
      );
      await Promise.all(bodies.map((body) => retainBrowserShape(body.shapeHandle, body.bodyId)));
      saved.bodies.forEach((body) => this.onMeshUpdated(body.body_id, body.mesh));
    } catch (error) {
      await Promise.all(bodies.map((body) => discardBrowserShape(body.shapeHandle).catch(() => undefined)));
      throw error;
    }
  }

  async execute(): Promise<void> {
    await this.apply(this.newParams);
    this.label = `Изменить параметры: ${Object.entries(this.newParams).map(([key, value]) => `${key}=${value}`).join(", ")}`;
  }

  async undo(): Promise<void> {
    await this.apply(this.oldParams);
  }
}
