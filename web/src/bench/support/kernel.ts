import { vi, type BenchOptions } from "vitest";
import { extrudeRequest, type WorkerReply } from "@/workers/testing/workerHarness";
import { perforatedPlate } from "./sketches";
import { SMOKE_RUN } from "./tiers";

const kernelWasm = vi.hoisted(() => decodeURIComponent(
  new URL("../../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname,
));

vi.mock("replicad-opencascadejs/wasm?url", () => ({ default: kernelWasm }));

export const wasmPath = kernelWasm;

export interface KernelModules {
  naming: typeof import("@/workers/geometry/naming");
  namedMesh: typeof import("@/workers/geometry/namedMesh");
  shapes: typeof import("@/workers/geometry/shapes");
}

type WorkerScope = {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => Promise<void>) | null;
};

type Prepare = () => Promise<unknown>;

const WARM_ROUNDS = 4;
const WARM_HOLES = 16;

const scope = globalThis as unknown as WorkerScope;
let lastReply: WorkerReply | null = null;
let nextId = 1;
let modules: KernelModules | null = null;
let warmed: Promise<void> | null = null;
let prepared: Prepare | null = null;

export async function freshKernel(): Promise<KernelModules> {
  console.log = () => undefined;
  scope.postMessage = (message) => {
    lastReply = message as WorkerReply;
  };
  vi.resetModules();
  const [naming, namedMesh, shapes] = await Promise.all([
    import("@/workers/geometry/naming"),
    import("@/workers/geometry/namedMesh"),
    import("@/workers/geometry/shapes"),
    import("@/workers/browser-geometry.worker"),
  ]);
  modules = { naming, namedMesh, shapes };
  await send({ kind: "init" });
  return modules;
}

export function kernel(): KernelModules {
  if (!modules) throw new Error("Ядро не загружено: бенчмарк должен идти через onFreshKernel.");
  return modules;
}

async function warmJit(): Promise<void> {
  if (SMOKE_RUN) return;
  await freshKernel();
  for (let round = 0; round < WARM_ROUNDS; round++) await roundTrip(extrudeRequest(perforatedPlate(WARM_HOLES), "k-warm"));
}

const noBodies: Prepare = async () => undefined;

export function onFreshKernel(options: BenchOptions, prepare: Prepare = noBodies): BenchOptions {
  return {
    ...options,
    setup: async (task, mode) => {
      await options.setup?.(task, mode);
      if (mode !== "warmup" || (SMOKE_RUN && prepared === prepare)) return;
      await (warmed ??= warmJit());
      await freshKernel();
      await prepare();
      prepared = prepare;
    },
  };
}

export async function send(request: Record<string, unknown>): Promise<WorkerReply> {
  const id = nextId++;
  await scope.onmessage?.({ data: { id, ...request } });
  const reply = lastReply;
  if (reply?.id !== id) throw new Error(`Нет ответа на запрос ${id}`);
  if (!reply.ok) throw new Error(reply.error);
  return reply;
}

export async function retain(request: Record<string, unknown>, bodyId: string): Promise<WorkerReply> {
  const reply = await send(request);
  await send({ kind: "retain", shapeHandle: reply.shapeHandle, bodyId });
  return reply;
}

export function discard(reply: WorkerReply): Promise<WorkerReply> {
  return send({ kind: "discard", shapeHandle: reply.shapeHandle });
}

export async function roundTrip(request: Record<string, unknown>): Promise<void> {
  await discard(await send(request));
}
