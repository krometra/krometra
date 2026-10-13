import { readonly, ref } from "vue";

export type BrowserKernelPhase = "idle" | "loading" | "ready" | "restarting" | "failed";

const phase = ref<BrowserKernelPhase>("idle");
const failure = ref<string | null>(null);
const heapBytes = ref(0);
const bodyCount = ref(0);

export function setBrowserKernelPhase(next: BrowserKernelPhase, message: string | null = null) {
  phase.value = next;
  failure.value = message;
}

export function setBrowserKernelMemory(nextHeapBytes: number, nextBodyCount: number) {
  heapBytes.value = nextHeapBytes;
  bodyCount.value = nextBodyCount;
}

export function useBrowserKernelStatus() {
  return {
    phase: readonly(phase),
    failure: readonly(failure),
    heapBytes: readonly(heapBytes),
    bodyCount: readonly(bodyCount),
  };
}
