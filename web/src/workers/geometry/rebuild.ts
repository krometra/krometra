import { RebuildCache, runRebuild, type RebuildBackend } from "@/lib/browserRebuildEngine";
import type { RebuildKind, RebuildPlanStep } from "@/lib/browserRebuildPlan";
import { booleanNamed } from "./boolean";
import { edgeFeatureNamed } from "./edgeOps";
import { extrudeNamed } from "./extrude";
import { mirrorNamed, type MirrorRequest } from "./mirror";
import { holeNamed, type HoleBuildRequest } from "./hole";
import type { NamedShape } from "./naming";
import { initOcct } from "./occt";
import { patternNamed, type PatternRequest } from "./pattern";
import { pressPullNamed, type PressPullRequest } from "./pressPull";
import { revolveNamed } from "./revolve";
import { bodyRevision, namedBodyShape, publishShape, releaseShape } from "./shapes";
import { shellNamed, type ShellRequest } from "./shell";
import { seatSketchOnFace } from "./sketchSeat";
import { sweepNamed, type SweepRequest } from "./sweep";
import { threadNamed, type ThreadBuildRequest } from "./thread";
import { transformNamed, type TransformRequest } from "./transform";
import type { BodyLookup, BooleanRequest, EdgeFeatureRequest, ExtrudeRequest, RevolveRequest } from "./types";

export interface RebuildRequest {
  id: number;
  kind: "rebuild";
  steps: RebuildPlanStep[];
}

const CACHE_CAPACITY = 48;

function importedBody(request: { bodyId: string }, lookup: BodyLookup): NamedShape {
  const stored = lookup(request.bodyId);
  return { shape: stored.shape.clone(), naming: stored.naming };
}

const builders: Record<RebuildKind, (request: never, lookup: BodyLookup) => NamedShape> = {
  import: importedBody,
  extrude: (request: ExtrudeRequest, lookup) => extrudeNamed(request, lookup),
  revolve: (request: RevolveRequest) => revolveNamed(request),
  sweep: (request: SweepRequest, lookup) => sweepNamed(request, lookup),
  boolean: (request: BooleanRequest, lookup) => booleanNamed(request, lookup),
  fillet: (request: EdgeFeatureRequest, lookup) => edgeFeatureNamed(request, lookup),
  chamfer: (request: EdgeFeatureRequest, lookup) => edgeFeatureNamed(request, lookup),
  thread: (request: ThreadBuildRequest, lookup) => threadNamed(request, (bodyId) => lookup(bodyId)),
  transform: (request: TransformRequest, lookup) => transformNamed(request, lookup),
  shell: (request: ShellRequest, lookup) => shellNamed(request, lookup),
  mirror: (request: MirrorRequest, lookup) => mirrorNamed(request, lookup),
  hole: (request: HoleBuildRequest, lookup) => holeNamed(request, lookup),
  pattern: (request: PatternRequest, lookup) => patternNamed(request, lookup),
  press_pull: (request: PressPullRequest, lookup) => pressPullNamed(request, lookup),
};

const backend: RebuildBackend<NamedShape> = {
  build: (step, lookup) => {
    const bodyLookup: BodyLookup = (bodyId) => {
      if (!bodyId) throw new Error("В истории не хватает входного тела для пересборки.");
      return lookup(bodyId);
    };
    return builders[step.kind]({ id: 0, ...step.request } as never, bodyLookup);
  },
  seat: seatSketchOnFace,
  load: (bodyId) => namedBodyShape(bodyId),
  revision: bodyRevision,
  dispose: (named) => named.shape.delete(),
};

const cache = new RebuildCache<NamedShape>(CACHE_CAPACITY, backend.dispose);

export async function runRebuildRequest(request: RebuildRequest) {
  await initOcct();
  const startedAt = performance.now();
  const { shapes, seats, failures, hits } = runRebuild(request.steps, backend, cache);
  const bodies: (Awaited<ReturnType<typeof publishShape>> & { bodyId: string })[] = [];
  try {
    for (const [bodyId, named] of shapes) {
      bodies.push({ bodyId, ...(await publishShape({ shape: named.shape.clone(), naming: named.naming }, startedAt)) });
    }
  } catch (error) {
    bodies.forEach((body) => releaseShape(body.shapeHandle));
    throw error;
  }
  const sketchPlanes = [...seats].map(([sketchId, placement]) => ({ sketchId, ...placement }));
  return { bodies, sketchPlanes, failures, cacheHits: hits, elapsedMs: Math.round(performance.now() - startedAt) };
}
