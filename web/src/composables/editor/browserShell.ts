import type { BrowserShellFeature } from "@/lib/browserShell";
import { buildResult, cloneBrowserWorkerInput, request, type BrowserBuildResult } from "./useBrowserGeometry";

export async function buildBrowserShell(feature: BrowserShellFeature, featureKey: string): Promise<BrowserBuildResult> {
  const result = await request({ kind: "shell", ...cloneBrowserWorkerInput(feature), featureKey });
  return buildResult(result, "Браузерное ядро вернуло неполный результат оболочки.");
}
