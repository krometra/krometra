import type { MeasureRef, MeasureResult } from "@/lib/measure";
import { cloneBrowserWorkerInput, request } from "./useBrowserGeometry";

export async function measureBrowserShapes(refs: MeasureRef[]): Promise<MeasureResult> {
  const result = await request({ kind: "measure", refs: cloneBrowserWorkerInput(refs) });
  if (!result.measure) throw new Error("Браузерное ядро не вернуло результат измерения.");
  return result.measure;
}
