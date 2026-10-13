import { describe, expect, it } from "vitest";
import {
  createKernelLedger,
  growsKernelModel,
  isFatalKernelError,
  isKernelOutOfMemory,
  KERNEL_HEAP_COMPACT_BYTES,
  kernelFailureMessage,
  kernelPhaseLabel,
  MAX_KERNEL_BODIES,
  MAX_KERNEL_MODEL_BYTES,
  modelLimitError,
  recordKernelExchange,
  shouldCompactKernelHeap,
} from "./browserKernel";

describe("kernel error classification", () => {
  it("recognizes WASM memory exhaustion", () => {
    expect(isKernelOutOfMemory("Aborted(OOM). Build with -sASSERTIONS for more info.")).toBe(true);
    expect(isKernelOutOfMemory("RangeError: Array buffer allocation failed")).toBe(true);
    expect(isKernelOutOfMemory("Standard_OutOfMemory")).toBe(true);
    expect(isKernelOutOfMemory("Тело не загружено в браузерное ядро.")).toBe(false);
  });

  it("treats aborts and traps as fatal, ordinary modelling errors as recoverable", () => {
    expect(isFatalKernelError("Aborted(native code called abort())")).toBe(true);
    expect(isFatalKernelError("RuntimeError: memory access out of bounds")).toBe(true);
    expect(isFatalKernelError("RuntimeError: unreachable")).toBe(true);
    expect(isFatalKernelError("Вырез не изменил объём тела")).toBe(false);
  });

  it("explains memory failures differently from other crashes", () => {
    expect(kernelFailureMessage("Aborted(OOM)")).toContain("не хватило памяти");
    expect(kernelFailureMessage("Aborted()")).toContain("аварийно остановилось");
  });
});

describe("model limits", () => {
  it("allows models below both limits", () => {
    expect(modelLimitError({ bodyCount: 3, modelBytes: 1024 })).toBeNull();
  });

  it("rejects too many bodies and too large models", () => {
    expect(modelLimitError({ bodyCount: MAX_KERNEL_BODIES, modelBytes: 0 })).toContain("предел модели");
    expect(modelLimitError({ bodyCount: 1, modelBytes: MAX_KERNEL_MODEL_BYTES })).toContain("больше предела");
  });

  it("compacts the heap only near the WASM address space limit", () => {
    expect(shouldCompactKernelHeap(512 * 1024 * 1024)).toBe(false);
    expect(shouldCompactKernelHeap(KERNEL_HEAP_COMPACT_BYTES)).toBe(true);
  });
});

describe("createKernelLedger", () => {
  it("counts retained and hydrated bodies, not staged or discarded results", () => {
    const ledger = createKernelLedger();
    ledger.hydrate("a", 100);
    ledger.stage("shape-1", 40);
    ledger.stage("shape-2", 7);
    expect(ledger.totals()).toEqual({ bodyCount: 1, modelBytes: 100 });
    expect(ledger.hasStagedShapes()).toBe(true);

    ledger.retain("shape-1", "b");
    ledger.discard("shape-2");
    expect(ledger.totals()).toEqual({ bodyCount: 2, modelBytes: 140 });

    ledger.release("a");
    expect(ledger.totals()).toEqual({ bodyCount: 1, modelBytes: 40 });
    expect(ledger.bodyIds()).toEqual(["b"]);
    expect(ledger.hasStagedShapes()).toBe(false);
  });

  it("replaces a body retained twice and forgets everything on clear", () => {
    const ledger = createKernelLedger();
    ledger.hydrate("a", 10);
    ledger.hydrate("a", 30);
    expect(ledger.totals()).toEqual({ bodyCount: 1, modelBytes: 30 });
    ledger.clear();
    expect(ledger.totals()).toEqual({ bodyCount: 0, modelBytes: 0 });
  });
});

describe("recordKernelExchange", () => {
  it("follows a build, retain, release lifecycle and hydration", () => {
    const ledger = createKernelLedger();
    recordKernelExchange(ledger, { kind: "extrude", sentBytes: 0, resultHandle: "shape-1", resultBytes: 64 });
    expect(ledger.totals()).toEqual({ bodyCount: 0, modelBytes: 0 });
    recordKernelExchange(ledger, { kind: "retain", shapeHandle: "shape-1", bodyId: "b", sentBytes: 0 });
    recordKernelExchange(ledger, { kind: "hydrate", bodyId: "a", sentBytes: 36 });
    expect(ledger.totals()).toEqual({ bodyCount: 2, modelBytes: 100 });
    recordKernelExchange(ledger, { kind: "release", bodyId: "b", sentBytes: 0 });
    expect(ledger.totals()).toEqual({ bodyCount: 1, modelBytes: 36 });
  });

  it("checks limits only for requests that build new geometry", () => {
    expect(growsKernelModel("extrude")).toBe(true);
    expect(growsKernelModel("fillet")).toBe(true);
    expect(growsKernelModel("hydrate")).toBe(false);
    expect(growsKernelModel("export")).toBe(false);
  });
});

describe("kernelPhaseLabel", () => {
  it("describes every kernel phase for the status bar", () => {
    expect(kernelPhaseLabel("loading", 0)).toBe("Загрузка ядра…");
    expect(kernelPhaseLabel("restarting", 0)).toBe("Перезапуск ядра…");
    expect(kernelPhaseLabel("failed", 0)).toBe("Ядро не загрузилось");
    expect(kernelPhaseLabel("ready", 0)).toBe("Ядро готово");
    expect(kernelPhaseLabel("ready", 64 * 1024 * 1024)).toBe("Ядро готово · 64 МБ");
    expect(kernelPhaseLabel("idle", 0)).toBe("Ядро не запущено");
  });
});
