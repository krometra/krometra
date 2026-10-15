import { assembleWire, genericSweep, getOC, makeLine, makeThreePointArc } from "replicad";
import type { Shape3D, Wire } from "replicad";
import type { BrowserExtrudeOperation } from "@/lib/browserBoolean";
import { browserPlaneFrame } from "@/lib/browserExtrudeFrame";
import { isFatalKernelError } from "@/lib/browserKernel";
import { sweepProbes } from "@/lib/browserSweepNaming";
import {
  browserSweepSpine,
  pipeWorldProbes,
  sweepSpinePoint,
  type BrowserSweepOrientation,
  type BrowserSweepSpine,
} from "@/lib/browserSweepPath";
import { combineWithTarget } from "./extrude";
import { namedFromSweep, type NamedShape } from "./naming";
import { sweepSketchProfiles } from "./profile";
import type { BodyLookup, SketchPlacement } from "./types";

export interface SweepRequest extends SketchPlacement {
  id: number;
  kind: "sweep";
  path: SketchPlacement;
  orientation: BrowserSweepOrientation;
  operation: BrowserExtrudeOperation;
  targetBodyId: string | null;
  featureKey: string;
}

const SWEEP_FAILED = "Ядро не смогло протянуть профиль по этому пути. Упростите путь или уменьшите профиль.";
const SELF_INTERSECTING = "Тело протяжки пересекает само себя: радиус изгиба пути меньше размера профиля. Увеличьте радиус дуг пути или уменьшите профиль.";

function spineWire(spine: BrowserSweepSpine): Wire {
  const point = (value: { x: number; y: number }) => sweepSpinePoint(spine, value);
  const edges = spine.segments.map((segment) => (
    segment.kind === "line"
      ? makeLine(point(segment.start), point(segment.end))
      : makeThreePointArc(point(segment.start), point(segment.via), point(segment.end))
  ));
  try {
    return assembleWire(edges);
  } finally {
    edges.forEach((edge) => edge.delete());
  }
}

function isValidSolid(shape: Shape3D): boolean {
  const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false);
  try {
    return analyzer.IsValid();
  } finally {
    analyzer.delete();
  }
}

function sweptProfiles(request: SweepRequest, spine: BrowserSweepSpine): Shape3D {
  const wire = spineWire(spine);
  try {
    return sweepSketchProfiles(request.entities, (center) => ({
      ...browserPlaneFrame({ ...request, center }),
      sweep: (sketch) => genericSweep(sketch.wire, wire, { frenet: request.orientation === "frenet", transitionMode: "right" }),
    }));
  } catch (error) {
    if (error instanceof Error && isFatalKernelError(error.message)) throw error;
    throw new Error(SWEEP_FAILED);
  } finally {
    wire.delete();
  }
}

export function sweepNamed(request: SweepRequest, lookup: BodyLookup): NamedShape {
  const spine = browserSweepSpine(request, request.path);
  const tool = sweptProfiles(request, spine);
  if (!isValidSolid(tool)) {
    tool.delete();
    throw new Error(SELF_INTERSECTING);
  }
  const probes = pipeWorldProbes(sweepProbes(request.entities), request, spine);
  return combineWithTarget(namedFromSweep(tool, request.featureKey, probes), request, lookup);
}
