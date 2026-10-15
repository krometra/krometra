export const MAX_KERNEL_BODIES = 300;
export const MAX_KERNEL_MODEL_BYTES = 200 * 1024 * 1024;
export const KERNEL_HEAP_COMPACT_BYTES = 3 * 1024 * 1024 * 1024;
export const MAX_BODY_STEP_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_BODIES = 50;

const OUT_OF_MEMORY = [
  /out of memory/i,
  /\bOOM\b/,
  /Cannot enlarge memory/i,
  /Array buffer allocation failed/i,
  /Standard_OutOfMemory/i,
  /bad_alloc/i,
];

const FATAL = [...OUT_OF_MEMORY, /Aborted\(/, /memory access out of bounds/i, /\bunreachable\b/i];

export function isKernelOutOfMemory(message: string): boolean {
  return OUT_OF_MEMORY.some((pattern) => pattern.test(message));
}

export function isFatalKernelError(message: string): boolean {
  return FATAL.some((pattern) => pattern.test(message));
}

export function kernelFailureMessage(message: string): string {
  if (isKernelOutOfMemory(message)) {
    return "Браузерному ядру не хватило памяти. Ядро перезапущено, тела восстановлены из проекта — упростите модель или удалите лишние тела.";
  }
  return "Браузерное ядро аварийно остановилось и перезапущено, тела восстановлены из проекта. Повторите операцию.";
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} МБ`;
}

export function kernelPhaseLabel(phase: string, heapBytes: number): string {
  if (phase === "loading") return "Загрузка ядра…";
  if (phase === "restarting") return "Перезапуск ядра…";
  if (phase === "failed") return "Ядро не загрузилось";
  if (phase === "ready") return heapBytes > 0 ? `Ядро готово · ${formatMegabytes(heapBytes)}` : "Ядро готово";
  return "Ядро не запущено";
}

export interface KernelLedgerTotals {
  bodyCount: number;
  modelBytes: number;
}

export function modelLimitError(totals: KernelLedgerTotals): string | null {
  if (totals.bodyCount >= MAX_KERNEL_BODIES) {
    return `В браузерном ядре уже ${totals.bodyCount} тел — это предел модели. Удалите лишние тела или разделите проект.`;
  }
  if (totals.modelBytes >= MAX_KERNEL_MODEL_BYTES) {
    return `Модель занимает ${formatMegabytes(totals.modelBytes)} — больше предела браузерного ядра (${formatMegabytes(MAX_KERNEL_MODEL_BYTES)}). Упростите модель или разделите проект.`;
  }
  return null;
}

export function shouldCompactKernelHeap(heapBytes: number): boolean {
  return heapBytes >= KERNEL_HEAP_COMPACT_BYTES;
}

export function createKernelLedger() {
  const staged = new Map<string, number>();
  const bodies = new Map<string, number>();

  function stage(shapeHandle: string, bytes: number) {
    staged.set(shapeHandle, bytes);
  }

  function retain(shapeHandle: string, bodyId: string) {
    bodies.set(bodyId, staged.get(shapeHandle) ?? 0);
    staged.delete(shapeHandle);
  }

  function discard(shapeHandle: string) {
    staged.delete(shapeHandle);
  }

  function hydrate(bodyId: string, bytes: number) {
    bodies.set(bodyId, bytes);
  }

  function release(bodyId: string) {
    bodies.delete(bodyId);
  }

  function clear() {
    staged.clear();
    bodies.clear();
  }

  function bodyIds(): string[] {
    return [...bodies.keys()];
  }

  function hasStagedShapes(): boolean {
    return staged.size > 0;
  }

  function totals(): KernelLedgerTotals {
    let modelBytes = 0;
    for (const bytes of bodies.values()) modelBytes += bytes;
    return { bodyCount: bodies.size, modelBytes };
  }

  return { stage, retain, discard, hydrate, release, clear, bodyIds, hasStagedShapes, totals };
}

export type KernelLedger = ReturnType<typeof createKernelLedger>;

const BOOKKEEPING_KINDS = new Set(["init", "retain", "discard", "release", "hydrate", "export", "thread-cylinder", "measure"]);

export function growsKernelModel(kind: string): boolean {
  return !BOOKKEEPING_KINDS.has(kind);
}

export interface KernelExchange {
  kind: string;
  shapeHandle?: string;
  bodyId?: string;
  sentBytes: number;
  resultHandle?: string;
  resultBytes?: number;
}

export function recordKernelExchange(ledger: KernelLedger, exchange: KernelExchange) {
  if (exchange.resultHandle && exchange.resultBytes !== undefined) ledger.stage(exchange.resultHandle, exchange.resultBytes);
  if (exchange.kind === "retain" && exchange.shapeHandle && exchange.bodyId) ledger.retain(exchange.shapeHandle, exchange.bodyId);
  else if (exchange.kind === "discard" && exchange.shapeHandle) ledger.discard(exchange.shapeHandle);
  else if (exchange.kind === "release" && exchange.bodyId) ledger.release(exchange.bodyId);
  else if (exchange.kind === "hydrate" && exchange.bodyId) ledger.hydrate(exchange.bodyId, exchange.sentBytes);
}
