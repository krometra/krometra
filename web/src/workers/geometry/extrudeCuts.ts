import { measureVolume } from "replicad";
import { browserVolumeChanged, NO_CUT_TARGET_MESSAGE } from "@/lib/browserBoolean";
import { namedBoolean } from "./boolean";
import { extrudeTool } from "./extrude";
import type { NamedShape } from "./naming";
import { initOcct } from "./occt";
import { namedBodyShape, publishShape, releaseShape } from "./shapes";
import type { BodyLookup, ExtrudeCutsRequest, ExtrudeRequest } from "./types";

export interface TargetCut {
  targetBodyId: string;
  named: NamedShape;
}

function cutIfTouched(targetBodyId: string, tool: NamedShape, featureKey: string, lookup: BodyLookup): TargetCut | null {
  const target = lookup(targetBodyId);
  const named = namedBoolean(target, tool, "subtract", featureKey);
  if (browserVolumeChanged(measureVolume(target.shape), measureVolume(named.shape))) return { targetBodyId, named };
  named.shape.delete();
  return null;
}

export function extrudeCutsNamed(request: ExtrudeCutsRequest, lookup: BodyLookup): TargetCut[] {
  const tool = extrudeTool({ ...request, kind: "extrude", operation: "cut" }, lookup);
  const cuts: TargetCut[] = [];
  try {
    for (const targetBodyId of new Set(request.targetBodyIds)) {
      const cut = cutIfTouched(targetBodyId, tool, request.featureKey, lookup);
      if (cut) cuts.push(cut);
    }
    if (cuts.length === 0) throw new Error(NO_CUT_TARGET_MESSAGE);
    return cuts;
  } catch (error) {
    cuts.forEach((cut) => cut.named.shape.delete());
    throw error;
  } finally {
    tool.shape.delete();
  }
}

export function isMultiCut(request: ExtrudeRequest): boolean {
  return Boolean(request.targetBodyIds?.length) && typeof request.instance === "number";
}

export function extrudeCutInstanceNamed(request: ExtrudeRequest, lookup: BodyLookup): NamedShape {
  const targetBodyId = request.targetBodyIds?.[(request.instance ?? 0) - 1];
  if (!targetBodyId) throw new Error("Тело выреза вне списка целей: пересоберите вырез заново.");
  const tool = extrudeTool(request, lookup);
  try {
    return namedBoolean(lookup(targetBodyId), tool, "subtract", request.featureKey);
  } finally {
    tool.shape.delete();
  }
}

export async function publishExtrudeCuts(request: ExtrudeCutsRequest) {
  await initOcct();
  const startedAt = performance.now();
  const cuts = extrudeCutsNamed(request, namedBodyShape);
  const published: (Awaited<ReturnType<typeof publishShape>> & { targetBodyId: string })[] = [];
  try {
    for (const cut of cuts) published.push({ targetBodyId: cut.targetBodyId, ...(await publishShape(cut.named, startedAt)) });
    return published;
  } catch (error) {
    cuts.slice(published.length).forEach((cut) => cut.named.shape.delete());
    published.forEach((body) => releaseShape(body.shapeHandle));
    throw error;
  }
}
