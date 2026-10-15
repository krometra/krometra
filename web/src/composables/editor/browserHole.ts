import { holeWorkerRequest, type HoleTarget } from "@/lib/holeFeature";
import type { HoleSpec } from "@/lib/holeGeometry";
import { buildResult, cloneBrowserWorkerInput, request, type BrowserBuildResult } from "./useBrowserGeometry";

export async function buildBrowserHole(target: HoleTarget, spec: HoleSpec, featureKey: string): Promise<BrowserBuildResult> {
  const result = await request(cloneBrowserWorkerInput(holeWorkerRequest(target, spec, featureKey)));
  return buildResult(result, "Браузерное ядро вернуло неполный результат отверстия.");
}
