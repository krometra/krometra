import { cast, getOC, isShape3D, Plane } from "replicad";
import type { Shape3D } from "replicad";
import type { BrowserExtrudeOperation } from "@/lib/browserBoolean";
import { browserPlaneFrame, sketchPlaneNormal } from "@/lib/browserExtrudeFrame";
import { isFatalKernelError } from "@/lib/browserKernel";
import { loftGeneratedFaces, type LoftSideFaces } from "@/lib/browserLoftNaming";
import { loftProfileOf } from "@/lib/browserLoftSetup";
import { browserProfileCenter } from "@/lib/browserProfile";
import { sketchPointToWorld, sweepProbes, type SweepProbe } from "@/lib/browserSweepNaming";
import { nameBody } from "@/lib/browserNaming";
import type { BRepOffsetAPI_ThruSections } from "replicad-opencascadejs";
import { combineWithTarget } from "./extrude";
import { touches, withTopology, type NamedShape } from "./naming";
import { sketchProfile } from "./profile";
import { isValidSolid } from "./sweep";
import { listShapes, type Topology } from "./topology";
import type { BodyLookup, SketchPlacement } from "./types";

export interface LoftRequest {
  id: number;
  kind: "loft";
  sections: SketchPlacement[];
  ruled: boolean;
  operation: BrowserExtrudeOperation;
  targetBodyId: string | null;
  featureKey: string;
}

type ProfileSketch = ReturnType<typeof sketchProfile>;

interface PlacedSection {
  sketch: ProfileSketch;
  probes: { key: string; point: [number, number, number] }[];
}

const LOFT_FAILED = "Ядро не смогло построить лофт по этим профилям. Проверьте порядок профилей и что их плоскости не пересекаются внутри тела.";
const SELF_INTERSECTING = "Тело лофта пересекает само себя: измените порядок профилей или их положение.";

function placedSection(section: SketchPlacement, index: number, withProbes: boolean): PlacedSection {
  const profile = loftProfileOf(section.entities, `профиль ${index + 1}`);
  const center = browserProfileCenter(profile);
  const frame = browserPlaneFrame({ ...section, center });
  const plane = new Plane(frame.origin, frame.u, sketchPlaneNormal(frame));
  try {
    const probes = withProbes
      ? sweepProbes(section.entities).map((probe: SweepProbe) => ({ key: probe.key, point: sketchPointToWorld(frame, center, probe.point) }))
      : [];
    return { sketch: sketchProfile(profile, plane, center), probes };
  } finally {
    plane.delete();
  }
}

function placedSections(request: LoftRequest): PlacedSection[] {
  if (request.sections.length < 2) throw new Error("Для лофта нужны минимум два профиля.");
  const sections: PlacedSection[] = [];
  try {
    request.sections.forEach((section, index) => sections.push(placedSection(section, index, index === 0)));
  } catch (error) {
    sections.forEach((section) => section.sketch.delete());
    throw error;
  }
  return sections;
}

function sideFaces(builder: BRepOffsetAPI_ThruSections, first: PlacedSection, topology: Topology): LoftSideFaces[] {
  const edges = first.sketch.wire.edges;
  try {
    return edges.map((edge) => {
      const keys = first.probes.filter((probe) => touches(edge.wrapped, probe.point)).map((probe) => probe.key).sort();
      const faces = listShapes(builder.Generated(edge.wrapped)).map((shape) => {
        const index = topology.faceIndex(shape);
        shape.delete();
        return index;
      });
      return { key: keys[0] ?? null, faces };
    });
  } finally {
    edges.forEach((edge) => edge.delete());
  }
}

function namedLoft(builder: BRepOffsetAPI_ThruSections, shape: Shape3D, first: PlacedSection, featureKey: string): NamedShape {
  const naming = withTopology(shape, (topology) => {
    const start = builder.FirstShape();
    const end = builder.LastShape();
    try {
      const generated = loftGeneratedFaces(sideFaces(builder, first, topology), topology.faceIndex(start), topology.faceIndex(end));
      return nameBody({ featureKey, faceCount: topology.faces.length, lineages: [], generated }, topology.snapshot);
    } finally {
      start.delete();
      end.delete();
    }
  });
  return { shape, naming };
}

function thruSections(request: LoftRequest, sections: PlacedSection[]): NamedShape {
  const oc = getOC();
  const builder = new oc.BRepOffsetAPI_ThruSections(true, request.ruled, 1e-6);
  try {
    builder.CheckCompatibility(true);
    sections.forEach((section) => builder.AddWire(section.sketch.wire.wrapped));
    let shape: Shape3D;
    try {
      builder.Build();
      if (!builder.IsDone()) throw new Error(LOFT_FAILED);
      const result = cast(builder.Shape());
      if (!isShape3D(result)) {
        result.delete();
        throw new Error(LOFT_FAILED);
      }
      shape = result;
    } catch (error) {
      if (error instanceof Error && isFatalKernelError(error.message)) throw error;
      throw new Error(LOFT_FAILED);
    }
    if (!isValidSolid(shape)) {
      shape.delete();
      throw new Error(SELF_INTERSECTING);
    }
    return namedLoft(builder, shape, sections[0], request.featureKey);
  } finally {
    builder.delete();
  }
}

export function loftNamed(request: LoftRequest, lookup: BodyLookup): NamedShape {
  const sections = placedSections(request);
  try {
    return combineWithTarget(thruSections(request, sections), request, lookup);
  } finally {
    sections.forEach((section) => section.sketch.delete());
  }
}
