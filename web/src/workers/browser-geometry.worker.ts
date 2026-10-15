import { booleanNamed } from "./geometry/boolean";
import { edgeFeatureNamed } from "./geometry/edgeOps";
import { extrudeNamed } from "./geometry/extrude";
import { holeNamed } from "./geometry/hole";
import { importStepBodies, type ImportStepRequest } from "./geometry/importStep";
import { runFilletMerge, type FilletMergeRequest } from "./geometry/filletMerge";
import { revolveNamed } from "./geometry/revolve";
import { runRebuildRequest, type RebuildRequest } from "./geometry/rebuild";
import {
  exportBodies,
  hydrateShape,
  namedBodyShape,
  publishNamed,
  publishShape,
  releaseShape,
  retainShape,
} from "./geometry/shapes";
import { initOcct, wasmHeapBytes } from "./geometry/occt";
import { runThreadRequest } from "./geometry/thread";
import { sectionBodies, type SectionRequest } from "./geometry/section";
import { transformNamed, type TransformRequest } from "./geometry/transform";
import type { ShapeRequest, WorkerRequest } from "./geometry/types";

type Request = WorkerRequest | RebuildRequest | FilletMergeRequest | ImportStepRequest | TransformRequest | SectionRequest;

const worker = globalThis as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<Request>) => void) | null;
};

function buildShape(data: Request) {
  if (data.kind === "extrude") return publishNamed(() => extrudeNamed(data, namedBodyShape));
  if (data.kind === "revolve") return publishNamed(() => revolveNamed(data));
  if (data.kind === "boolean") return publishNamed(() => booleanNamed(data, namedBodyShape));
  if (data.kind === "fillet" || data.kind === "chamfer") return publishNamed(() => edgeFeatureNamed(data, namedBodyShape));
  if (data.kind === "transform") return publishNamed(() => transformNamed(data, namedBodyShape));
  if (data.kind === "hole") return publishNamed(() => holeNamed(data, namedBodyShape));
  return null;
}

async function manageShape(data: ShapeRequest) {
  if (data.kind === "init") await initOcct();
  else if (data.kind === "retain") retainShape(data.shapeHandle, data.bodyId);
  else if (data.kind === "discard") releaseShape(data.shapeHandle);
  else if (data.kind === "release") releaseShape(undefined, data.bodyId);
  else if (data.kind === "hydrate") return hydrateShape(data.bodyId, data.step, data.naming);
  else throw new Error("Неизвестная операция браузерного ядра.");
  return {};
}

function reply(message: Record<string, unknown>, transfer: Transferable[] = []) {
  worker.postMessage({ ...message, heapBytes: wasmHeapBytes() }, transfer);
}

worker.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    const building = buildShape(data);
    if (building) {
      const result = await building;
      reply({ id: data.id, ok: true, ...result }, [result.step]);
      return;
    }
    if (data.kind === "thread" || data.kind === "thread-cylinder") {
      const result = await runThreadRequest(data, { init: initOcct, lookup: namedBodyShape, publishShape });
      reply({ id: data.id, ok: true, ...result }, "step" in result ? [result.step] : []);
      return;
    }
    if (data.kind === "fillet-merge") {
      const result = await runFilletMerge(data, namedBodyShape);
      reply({ id: data.id, ok: true, ...result }, [result.step]);
      return;
    }
    if (data.kind === "rebuild") {
      const result = await runRebuildRequest(data);
      reply({ id: data.id, ok: true, ...result }, result.bodies.map((body) => body.step));
      return;
    }
    if (data.kind === "import-step") {
      const result = await importStepBodies(data);
      reply({ id: data.id, ok: true, ...result }, result.imported.map((body) => body.step));
      return;
    }
    if (data.kind === "section") {
      reply({ id: data.id, ok: true, sections: await sectionBodies(data) });
      return;
    }
    if (data.kind === "export") {
      const file = await exportBodies(data);
      reply({ id: data.id, ok: true, file }, [file]);
      return;
    }
    reply({ id: data.id, ok: true, ...(await manageShape(data as ShapeRequest)) });
  } catch (error) {
    worker.postMessage({
      id: data.id,
      ok: false,
      error: error instanceof Error ? error.message : "Не удалось построить геометрию в браузере.",
    });
  }
};
