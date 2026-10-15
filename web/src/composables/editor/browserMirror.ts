import type { MirrorPlane } from "@/lib/mirrorPlane";
import { cloneBrowserWorkerInput, request, type BrowserBuildResult } from "./useBrowserGeometry";

export async function buildBrowserMirror(bodyId: string, plane: MirrorPlane, merge: boolean, featureKey: string): Promise<BrowserBuildResult> {
  const result = await request({ kind: "mirror", bodyId, plane: cloneBrowserWorkerInput(plane), merge, featureKey });
  const { step, mesh, naming, shapeHandle, elapsedMs } = result;
  if (!step || !mesh || !naming || !shapeHandle || elapsedMs === undefined) {
    throw new Error("Браузерное ядро вернуло неполный результат зеркала.");
  }
  return { step, mesh, naming, shapeHandle, elapsedMs };
}
