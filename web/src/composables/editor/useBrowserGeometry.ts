import type { PatternMode, PatternSpec } from "@/lib/bodyPattern";
import type { BodyTransform } from "@/lib/bodyTransform";
import type { BrowserBooleanOperation, BrowserExtrudeOperation } from "@/lib/browserBoolean";
import type { BrowserExtentType, BrowserExtrudeDirection } from "@/lib/browserExtrudeExtent";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import {
  createKernelLedger,
  growsKernelModel,
  isFatalKernelError,
  kernelFailureMessage,
  modelLimitError,
  recordKernelExchange,
  shouldCompactKernelHeap,
  type KernelExchange,
} from "@/lib/browserKernel";
import type { FilletMergePlan } from "@/lib/browserFilletRun";
import { importSizeError } from "@/lib/browserImport";
import type { MeshTolerance } from "@/lib/meshQuality";
import type { SavedNaming } from "@/lib/browserNaming";
import type { RebuildFailure } from "@/lib/browserRebuildEngine";
import type { RebuildPlanStep } from "@/lib/browserRebuildPlan";
import type { SketchSeatPlacement } from "@/lib/browserSketchSeat";
import type { BrowserSweepOrientation } from "@/lib/browserSweepPath";
import type { MeshData, PlaneBasis, SketchEntity, SketchPlane } from "@/types/api";
import { setBrowserKernelMemory, setBrowserKernelPhase } from "./browserKernelStatus";

export interface BrowserSketchPlacement {
  entities: SketchEntity[];
  plane: SketchPlane;
  planeOffset: number;
  planeBasis: PlaneBasis | null;
}

export interface BrowserExtrudeOptions {
  distance: number;
  direction: BrowserExtrudeDirection;
  extentType: BrowserExtentType;
  backDistance: number;
  offset: number;
  operation: BrowserExtrudeOperation;
  targetBodyId: string | null;
  upToBodyId: string | null;
  upToFaceId: string | number | null;
  upToFacePoints: Vector3[] | null;
}

export interface BrowserSweepOptions {
  path: BrowserSketchPlacement;
  orientation: BrowserSweepOrientation;
  operation: BrowserExtrudeOperation;
  targetBodyId: string | null;
}

export interface BrowserLoftOptions {
  sections: BrowserSketchPlacement[];
  ruled: boolean;
  operation: BrowserExtrudeOperation;
  targetBodyId: string | null;
}

export interface BrowserBuildResult {
  step: ArrayBuffer;
  mesh: MeshData;
  naming: SavedNaming;
  elapsedMs: number;
  shapeHandle: string;
}

export interface BrowserRebuiltBody extends BrowserBuildResult {
  bodyId: string;
}

export interface BrowserSeatedSketch extends SketchSeatPlacement {
  sketchId: string;
}

export interface BrowserRebuildResult {
  bodies: BrowserRebuiltBody[];
  sketchPlanes: BrowserSeatedSketch[];
  failures: RebuildFailure[];
}

export type BrowserEdgeFeature =
  | { kind: "fillet"; bodyId: string; edgeNames: string[]; radius: number }
  | { kind: "chamfer"; bodyId: string; edgeNames: string[]; distance1: number; distance2: number };

interface WorkerResponse {
  id: number;
  ok: boolean;
  error?: string;
  step?: ArrayBuffer;
  mesh?: MeshData;
  naming?: SavedNaming;
  elapsedMs?: number;
  shapeHandle?: string;
  file?: ArrayBuffer;
  heapBytes?: number;
  bodies?: BrowserRebuiltBody[];
  imported?: BrowserBuildResult[];
  sketchPlanes?: BrowserSeatedSketch[];
  failures?: RebuildFailure[];
  cacheHits?: number;
  edgeNames?: string[];
  sections?: BrowserBodySection[];
  triangles?: number;
  measure?: import("@/lib/measure").MeasureResult;
}

export interface BrowserBodySection {
  bodyId: string;
  polylines: number[][];
}

interface PendingRequest {
  resolve: (data: WorkerResponse) => void;
  reject: (error: Error) => void;
  timeout: number;
  exchange: KernelExchange;
}

const WORKER_TIMEOUT_MS = 30_000;
const IMPORT_TIMEOUT_MS = 120_000;
let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();
const ledger = createKernelLedger();
const restartListeners = new Set<(bodyIds: string[]) => Promise<void>>();

function stopWorker(error?: Error) {
  worker?.terminate();
  worker = null;
  ledger.clear();
  for (const request of pending.values()) {
    clearTimeout(request.timeout);
    request.reject(error ?? new Error("Браузерное ядро остановлено."));
  }
  pending.clear();
}

function restoreKernel(reason: string) {
  const bodyIds = ledger.bodyIds();
  stopWorker(new Error(reason));
  if (restartListeners.size === 0) {
    setBrowserKernelPhase("idle");
    return;
  }
  setBrowserKernelPhase("restarting");
  Promise.all([...restartListeners].map((restore) => restore(bodyIds))).then(
    () => setBrowserKernelPhase("ready"),
    (error: unknown) => setBrowserKernelPhase("failed", error instanceof Error ? error.message : reason),
  );
}

function settle(data: WorkerResponse) {
  const request = pending.get(data.id);
  if (!request) return;
  clearTimeout(request.timeout);
  pending.delete(data.id);
  if (!data.ok) {
    const message = data.error || "Не удалось выполнить команду браузерного ядра.";
    if (!isFatalKernelError(message)) {
      request.reject(new Error(message));
      return;
    }
    const explanation = kernelFailureMessage(message);
    request.reject(new Error(explanation));
    restoreKernel(explanation);
    return;
  }
  recordKernelExchange(ledger, { ...request.exchange, resultHandle: data.shapeHandle, resultBytes: data.step?.byteLength });
  for (const body of [...(data.bodies ?? []), ...(data.imported ?? [])]) ledger.stage(body.shapeHandle, body.step.byteLength);
  const totals = ledger.totals();
  setBrowserKernelMemory(data.heapBytes ?? 0, totals.bodyCount);
  request.resolve(data);
  if (shouldCompactKernelHeap(data.heapBytes ?? 0) && pending.size === 0 && !ledger.hasStagedShapes()) {
    restoreKernel("Браузерное ядро перезапущено, чтобы освободить память.");
  }
}

function browserWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../../workers/browser-geometry.worker.ts", import.meta.url), { type: "module" });
  worker.onerror = (event) => restoreKernel(kernelFailureMessage(event.message || "Aborted()"));
  worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => settle(data);
  return worker;
}

export function request(payload: Record<string, unknown> & { kind: string }, transfer: Transferable[] = []): Promise<WorkerResponse> {
  const limitError = growsKernelModel(payload.kind) ? modelLimitError(ledger.totals()) : null;
  if (limitError) return Promise.reject(new Error(limitError));
  const id = nextRequestId++;
  const exchange: KernelExchange = {
    kind: payload.kind,
    shapeHandle: typeof payload.shapeHandle === "string" ? payload.shapeHandle : undefined,
    bodyId: typeof payload.bodyId === "string" ? payload.bodyId : undefined,
    sentBytes: payload.step instanceof ArrayBuffer ? payload.step.byteLength : 0,
  };
  const timeoutMs = payload.kind === "import-step" ? IMPORT_TIMEOUT_MS : WORKER_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      restoreKernel(`Браузерное ядро не ответило за ${timeoutMs / 1000} секунд и перезапущено.`);
    }, timeoutMs);
    pending.set(id, { resolve, reject, timeout, exchange });
    browserWorker().postMessage({ id, ...payload }, transfer);
  });
}

export async function warmUpBrowserKernel(): Promise<void> {
  setBrowserKernelPhase("loading");
  try {
    await request({ kind: "init" });
    setBrowserKernelPhase("ready");
  } catch (error) {
    setBrowserKernelPhase("failed", error instanceof Error ? error.message : "Не удалось загрузить браузерное ядро.");
  }
}

export function onBrowserKernelRestart(restore: (bodyIds: string[]) => Promise<void>): () => void {
  restartListeners.add(restore);
  return () => restartListeners.delete(restore);
}

export function cloneBrowserWorkerInput<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

export function buildResult(result: WorkerResponse, failure: string): BrowserBuildResult {
  if (!result.step || !result.mesh || !result.naming || !result.shapeHandle || result.elapsedMs === undefined) {
    throw new Error(failure);
  }
  return { step: result.step, mesh: result.mesh, naming: result.naming, elapsedMs: result.elapsedMs, shapeHandle: result.shapeHandle };
}

export async function buildBrowserExtrude(input: BrowserSketchPlacement & BrowserExtrudeOptions, featureKey: string): Promise<BrowserBuildResult> {
  const result = await request({ kind: "extrude", ...cloneBrowserWorkerInput(input), featureKey });
  return buildResult(result, "Браузерное ядро вернуло неполный результат выдавливания.");
}

export async function buildBrowserRevolve(input: BrowserSketchPlacement & { axisOrigin: { x: number; y: number }; axis: "x" | "y"; angle: number; direction: "one_side" | "symmetric" }, featureKey: string): Promise<BrowserBuildResult> {
  const result = await request({ kind: "revolve", ...cloneBrowserWorkerInput(input), featureKey });
  return buildResult(result, "Браузерное ядро вернуло неполный результат вращения.");
}

export async function buildBrowserSweep(input: BrowserSketchPlacement & BrowserSweepOptions, featureKey: string): Promise<BrowserBuildResult> {
  const result = await request({ kind: "sweep", ...cloneBrowserWorkerInput(input), featureKey });
  return buildResult(result, "Браузерное ядро вернуло неполный результат протяжки.");
}

export async function buildBrowserLoft(input: BrowserLoftOptions, featureKey: string): Promise<BrowserBuildResult> {
  const result = await request({ kind: "loft", ...cloneBrowserWorkerInput(input), featureKey });
  return buildResult(result, "Браузерное ядро вернуло неполный результат лофта.");
}

export async function buildBrowserBoolean(operation: BrowserBooleanOperation, targetBodyId: string, toolBodyId: string, featureKey: string): Promise<BrowserBuildResult> {
  const result = await request({ kind: "boolean", operation, targetBodyId, toolBodyId, featureKey });
  return buildResult(result, "Браузерное ядро вернуло неполный результат булевой операции.");
}

export async function buildBrowserTransform(bodyId: string, transform: BodyTransform, featureKey: string): Promise<BrowserBuildResult> {
  const result = await request({ kind: "transform", bodyId, ...cloneBrowserWorkerInput(transform), featureKey });
  return buildResult(result, "Браузерное ядро вернуло неполный результат перемещения.");
}

export async function buildBrowserPattern(bodyId: string, pattern: PatternSpec, mode: PatternMode, instance: number | null, featureKey: string): Promise<BrowserBuildResult> {
  const result = await request({ kind: "pattern", bodyId, pattern: cloneBrowserWorkerInput(pattern), mode, instance, featureKey });
  return buildResult(result, "Браузерное ядро вернуло неполный результат массива.");
}

export async function buildBrowserEdgeFeature(feature: BrowserEdgeFeature, featureKey: string): Promise<BrowserBuildResult> {
  const result = await request({ ...cloneBrowserWorkerInput(feature), featureKey });
  return buildResult(result, feature.kind === "fillet" ? "Браузерное ядро вернуло неполный результат скругления." : "Браузерное ядро вернуло неполный результат фаски.");
}

export async function buildBrowserFilletMerge(plan: FilletMergePlan, radius: number): Promise<BrowserBuildResult & { edgeNames: string[] }> {
  const result = await request({ kind: "fillet-merge", ...cloneBrowserWorkerInput(plan), radius });
  if (!result.edgeNames) throw new Error("Браузерное ядро не вернуло рёбра пересобранного скругления.");
  return { ...buildResult(result, "Браузерное ядро вернуло неполный результат скругления."), edgeNames: result.edgeNames };
}

export async function rebuildBrowserHistory(steps: RebuildPlanStep[]): Promise<BrowserRebuildResult> {
  const result = await request({ kind: "rebuild", steps: cloneBrowserWorkerInput(steps) });
  if (!result.bodies || !result.sketchPlanes) throw new Error("Браузерное ядро не вернуло пересобранные тела.");
  return { bodies: result.bodies, sketchPlanes: result.sketchPlanes, failures: result.failures ?? [] };
}

export async function importBrowserStep(file: ArrayBuffer): Promise<BrowserBuildResult[]> {
  const result = await request({ kind: "import-step", file, existingBodies: ledger.totals().bodyCount }, [file]);
  const bodies = result.imported ?? [];
  if (bodies.length === 0) throw new Error("Браузерное ядро не вернуло импортированные тела.");
  const sizeError = importSizeError(ledger.totals(), bodies.map((body) => body.step.byteLength));
  if (!sizeError) return bodies;
  await Promise.all(bodies.map((body) => discardBrowserShape(body.shapeHandle).catch(() => undefined)));
  throw new Error(sizeError);
}

export async function sectionBrowserBodies(bodyIds: string[], origin: Vector3, normal: Vector3): Promise<BrowserBodySection[]> {
  const result = await request({ kind: "section", bodyIds: [...bodyIds], origin: [...origin], normal: [...normal] });
  if (!result.sections) throw new Error("Браузерное ядро не вернуло сечение.");
  return result.sections;
}

export async function exportBrowserBodies(format: "step" | "stl" | "3mf", bodyIds: string[], mesh?: { mesh: MeshTolerance; names: string[] }): Promise<ArrayBuffer> {
  const result = await request({ kind: "export", format, bodyIds: [...bodyIds], ...(mesh ? { mesh: { ...mesh.mesh }, names: [...mesh.names] } : {}) });
  if (!result.file) throw new Error("Браузерное ядро не вернуло файл экспорта.");
  return result.file;
}

export async function estimateBrowserTriangles(bodyIds: string[], mesh: MeshTolerance): Promise<number> {
  const result = await request({ kind: "export-estimate", bodyIds: [...bodyIds], mesh: { ...mesh } });
  if (result.triangles === undefined) throw new Error("Браузерное ядро не оценило число треугольников.");
  return result.triangles;
}

export async function retainBrowserShape(shapeHandle: string, bodyId: string): Promise<void> {
  await request({ kind: "retain", shapeHandle, bodyId });
}

export async function discardBrowserShape(shapeHandle: string): Promise<void> {
  await request({ kind: "discard", shapeHandle });
}

export async function releaseBrowserShape(bodyId: string): Promise<void> {
  await request({ kind: "release", bodyId });
}

export async function hydrateBrowserShape(bodyId: string, step: ArrayBuffer, naming: SavedNaming | null): Promise<MeshData | null> {
  const result = await request({ kind: "hydrate", bodyId, step, naming }, [step]);
  return result.mesh ?? null;
}

export function disposeBrowserGeometry() {
  stopWorker();
  setBrowserKernelPhase("idle");
}
