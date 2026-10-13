import initOpenCascade from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import { setOC } from "replicad";

let ready: Promise<void> | null = null;
let wasmMemory: WebAssembly.Memory | null = null;

export function wasmHeapBytes(): number {
  return wasmMemory?.buffer.byteLength ?? 0;
}

export function initOcct() {
  if (!ready) {
    ready = initOpenCascade({ locateFile: () => wasmUrl })
      .then((oc) => {
        wasmMemory = (oc as unknown as { wasmMemory?: WebAssembly.Memory }).wasmMemory ?? null;
        setOC(oc);
      })
      .catch((error: unknown) => {
        ready = null;
        throw error;
      });
  }
  return ready;
}
