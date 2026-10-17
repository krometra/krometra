import type { BrowserPressPullFeature } from "@/lib/browserPressPull";
import { buildResult, cloneBrowserWorkerInput, request, type BrowserBuildResult } from "./useBrowserGeometry";

export async function buildBrowserPressPull(feature: BrowserPressPullFeature, featureKey: string): Promise<BrowserBuildResult> {
  const result = await request({ kind: "press_pull", ...cloneBrowserWorkerInput(feature), featureKey });
  return buildResult(result, "Браузерное ядро вернуло неполный результат сдвига грани.");
}
