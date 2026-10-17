import { getOC, measureVolume } from "replicad";
import type { Shape3D } from "replicad";
import type { TopoDS_Shape } from "replicad-opencascadejs";
import { nameBody, resolveNames, type FaceLineage, type GeneratedFaces } from "@/lib/browserNaming";
import {
  pressPullFailureMessage,
  pressPullOperation,
  pressPullParamsError,
  pressPullVolumeChanged,
  type BrowserPressPullFeature,
  type PressPullOperation,
} from "@/lib/browserPressPull";
import { namedBoolean } from "./boolean";
import { touches, withTopology, type NamedShape } from "./naming";
import { slabOf, sourceFace, surfaceOf, type SourceFace } from "./pressPullSlab";
import { isValidShape } from "./thread";
import type { Topology } from "./topology";
import type { BodyLookup } from "./types";

export interface PressPullRequest extends BrowserPressPullFeature {
  id: number;
  kind: "press_pull";
  featureKey: string;
}

type PressPullParams = Omit<BrowserPressPullFeature, "bodyId">;

function distanceBetween(a: TopoDS_Shape, b: TopoDS_Shape): number {
  const distance = new (getOC().BRepExtrema_DistShapeShape)(a, b);
  try {
    return distance.IsDone() ? distance.Value() : Number.NaN;
  } finally {
    distance.delete();
  }
}

function slabRoles(topology: Topology, source: SourceFace, distance: number) {
  const faces = topology.faces.map((_, index) => index);
  const cap = faces.filter((index) => distanceBetween(topology.faces[index], source.shape) > Math.abs(distance) / 2);
  const touching = (index: number) => source.edges.filter(({ midpoint }) => touches(topology.faces[index], midpoint)).length;
  const base = faces.filter((index) => (
    !cap.includes(index) && surfaceOf(topology.faces[index]) === source.surface && touching(index) === source.edges.length
  ));
  const sides = source.edges.map(({ name, midpoint }) => ({
    key: `side:${name}`,
    images: faces.filter((index) => !cap.includes(index) && !base.includes(index) && touches(topology.faces[index], midpoint)),
  }));
  return { cap, base, sides };
}

function namedSlab(slab: Shape3D, source: SourceFace, distance: number, featureKey: string, keepName: boolean): NamedShape {
  const naming = withTopology(slab, (topology) => {
    const { cap, base, sides } = slabRoles(topology, source, distance);
    const lineages: FaceLineage[] = keepName ? [{ names: [source.name], images: [cap] }] : [];
    const generated: GeneratedFaces[] = [...(keepName ? [] : [{ key: "cap", images: cap }]), { key: "base", images: base }, ...sides];
    return nameBody({ featureKey: `${featureKey}/${source.name}`, faceCount: topology.faces.length, lineages, generated }, topology.snapshot);
  });
  return { shape: slab, naming };
}

function namedSlabOf(source: SourceFace, distance: number, featureKey: string, keepName: boolean): NamedShape {
  const slab = slabOf(source, distance);
  try {
    return namedSlab(slab, source, distance, featureKey, keepName);
  } catch (error) {
    slab.delete();
    throw error;
  }
}

function namedSlabs(body: NamedShape, feature: PressPullParams, featureKey: string): NamedShape[] {
  const indices = resolveNames(body.naming.faces, feature.faceNames, "грань");
  return withTopology(body.shape, (topology) => {
    const sources = indices.map((index) => sourceFace(body, topology, index));
    const slabs: NamedShape[] = [];
    try {
      sources.forEach((source) => slabs.push(namedSlabOf(source, feature.distance, featureKey, !feature.newBody)));
      return slabs;
    } catch (error) {
      slabs.forEach((slab) => slab.shape.delete());
      throw error;
    }
  });
}

function combine(start: NamedShape, tools: NamedShape[], operation: PressPullOperation, featureKey: string): NamedShape {
  let current = start;
  try {
    for (const tool of tools) {
      const next = namedBoolean(current, tool, operation, featureKey);
      if (current !== start) current.shape.delete();
      current = next;
    }
    return current;
  } catch (error) {
    if (current !== start) current.shape.delete();
    throw error;
  }
}

function checkedResult(result: NamedShape, accept: (shape: Shape3D) => boolean, message: string): NamedShape {
  if (isValidShape(result.shape) && accept(result.shape)) return result;
  result.shape.delete();
  throw new Error(message);
}

function pressedBody(body: NamedShape, slabs: NamedShape[], distance: number, featureKey: string): NamedShape {
  const failure = pressPullFailureMessage(distance);
  let result: NamedShape;
  try {
    result = combine(body, slabs, pressPullOperation(distance), featureKey);
  } catch {
    throw new Error(failure);
  }
  const sourceVolume = measureVolume(body.shape);
  return checkedResult(result, (shape) => pressPullVolumeChanged(sourceVolume, measureVolume(shape), distance), failure);
}

function extrudedFaces(slabs: NamedShape[], distance: number, featureKey: string): NamedShape {
  const [first, ...rest] = slabs;
  const merged = combine(first, rest, "union", featureKey);
  const result = merged === first ? { shape: first.shape.clone(), naming: first.naming } : merged;
  return checkedResult(result, (shape) => measureVolume(shape) > 0, pressPullFailureMessage(distance));
}

export function namedPressPull(body: NamedShape, feature: PressPullParams, featureKey: string): NamedShape {
  const invalid = pressPullParamsError(feature);
  if (invalid) throw new Error(invalid);
  const slabs = namedSlabs(body, feature, featureKey);
  try {
    return feature.newBody ? extrudedFaces(slabs, feature.distance, featureKey) : pressedBody(body, slabs, feature.distance, featureKey);
  } finally {
    slabs.forEach((slab) => slab.shape.delete());
  }
}

export function pressPullNamed(request: PressPullRequest, lookup: BodyLookup): NamedShape {
  return namedPressPull(lookup(request.bodyId), request, request.featureKey);
}
