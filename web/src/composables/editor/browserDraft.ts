import type { BrowserDraftFeature } from "@/lib/browserDraft";
import { buildResult, cloneBrowserWorkerInput, request, type BrowserBuildResult } from "./useBrowserGeometry";

export async function buildBrowserDraft(feature: BrowserDraftFeature, featureKey: string): Promise<BrowserBuildResult> {
  const result = await request({ kind: "draft", ...cloneBrowserWorkerInput(feature), featureKey });
  return buildResult(result, "Браузерное ядро вернуло неполный результат уклона.");
}
