import { Face, getOC } from "replicad";
import type { Shape3D } from "replicad";
import type { NCollection_List_TopoDS_Shape, TopoDS_Shape } from "replicad-opencascadejs";
import {
  nameBody,
  resolveNames,
  restoreNaming,
  uniqueFingerprintMatch,
  type BodyNaming,
  type FaceLineage,
  type GeneratedFaces,
  type SavedNaming,
} from "@/lib/browserNaming";
import { geometryNaming } from "@/lib/browserImport";
import { sweepGeneratedFaces, type ProbeHits, type WorldProbe } from "@/lib/browserSweepNaming";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import { listShapes, readTopology, type Topology } from "./topology";

export interface NamedShape {
  shape: Shape3D;
  naming: BodyNaming;
}

export interface HistoryAlgorithm {
  Modified(shape: TopoDS_Shape): NCollection_List_TopoDS_Shape;
  Generated(shape: TopoDS_Shape): NCollection_List_TopoDS_Shape;
}

const CONTACT_TOLERANCE = 1e-5;

export function withTopology<T>(shape: Shape3D, use: (topology: Topology) => T): T {
  const topology = readTopology(shape.wrapped);
  try {
    return use(topology);
  } finally {
    topology.dispose();
  }
}

function imagesIn(result: Topology, shapes: TopoDS_Shape[]): number[] {
  const images = shapes.map((shape) => {
    const index = result.faceIndex(shape);
    shape.delete();
    return index;
  });
  return [...new Set(images.filter((index) => index >= 0))];
}

export function faceLineage(algorithm: HistoryAlgorithm, input: Topology, names: string[], result: Topology): FaceLineage {
  const images = input.faces.map((face) => {
    const modified = imagesIn(result, listShapes(algorithm.Modified(face)));
    if (modified.length > 0) return modified;
    const same = result.faceIndex(face);
    return same >= 0 ? [same] : [];
  });
  const taken = new Set(images.flat());
  images.forEach((faceImages, index) => {
    if (faceImages.length > 0) return;
    const match = uniqueFingerprintMatch(input.snapshot.faces[index], result.snapshot.faces, taken);
    if (match < 0) return;
    taken.add(match);
    images[index] = [match];
  });
  return { names, images };
}

export function generatedFaces(algorithm: HistoryAlgorithm, sources: { key: string; shape: TopoDS_Shape }[], result: Topology): GeneratedFaces[] {
  return sources.map(({ key, shape }) => ({ key, images: imagesIn(result, listShapes(algorithm.Generated(shape))) }));
}

export function namedFromHistory(input: {
  algorithm: HistoryAlgorithm;
  inputs: NamedShape[];
  result: Shape3D;
  featureKey: string;
  generated?: (result: Topology, inputs: Topology[]) => GeneratedFaces[];
}): NamedShape {
  const inputTopologies = input.inputs.map((named) => readTopology(named.shape.wrapped));
  const result = readTopology(input.result.wrapped);
  try {
    const lineages = inputTopologies.map((topology, index) => (
      faceLineage(input.algorithm, topology, input.inputs[index].naming.faces, result)
    ));
    const naming = nameBody({
      featureKey: input.featureKey,
      faceCount: result.faces.length,
      lineages,
      generated: input.generated?.(result, inputTopologies) ?? [],
    }, result.snapshot);
    return { shape: input.result, naming };
  } finally {
    inputTopologies.forEach((topology) => topology.dispose());
    result.dispose();
  }
}

export function touches(shape: TopoDS_Shape, point: Vector3): boolean {
  const oc = getOC();
  const pnt = new oc.gp_Pnt(point[0], point[1], point[2]);
  const maker = new oc.BRepBuilderAPI_MakeVertex(pnt);
  const vertex = maker.Vertex();
  const distance = new oc.BRepExtrema_DistShapeShape(vertex, shape);
  try {
    return distance.IsDone() && distance.Value() < CONTACT_TOLERANCE;
  } finally {
    distance.delete();
    vertex.delete();
    maker.delete();
    pnt.delete();
  }
}

function probeHits(topology: Topology, probes: WorldProbe[]): ProbeHits[] {
  const facesTouching = (point: Vector3) => topology.faces
    .map((face, index) => (touches(face, point) ? index : -1))
    .filter((index) => index >= 0);
  return probes.map((probe) => ({
    key: probe.key,
    start: facesTouching(probe.start),
    middle: facesTouching(probe.middle),
    end: facesTouching(probe.end),
  }));
}

export function namedFromSweep(shape: Shape3D, featureKey: string, probes: WorldProbe[]): NamedShape {
  const naming = withTopology(shape, (topology) => nameBody({
    featureKey,
    faceCount: topology.faces.length,
    lineages: [],
    generated: sweepGeneratedFaces(topology.faces.length, probeHits(topology, probes)),
  }, topology.snapshot));
  return { shape, naming };
}

export function namedFresh(shape: Shape3D, featureKey: string): NamedShape {
  const naming = withTopology(shape, (topology) => nameBody({
    featureKey,
    faceCount: topology.faces.length,
    lineages: [],
    generated: [],
  }, topology.snapshot));
  return { shape, naming };
}

export function namedFromGeometry(shape: Shape3D): NamedShape {
  return { shape, naming: withTopology(shape, (topology) => geometryNaming(topology.snapshot)) };
}

export function namedFromSaved(shape: Shape3D, saved: SavedNaming | null, fallbackKey: string): NamedShape {
  const naming = withTopology(shape, (topology) => restoreNaming(saved, topology.snapshot, fallbackKey));
  return { shape, naming };
}

export function faceByName(named: NamedShape, faceName: string): Face {
  const [index] = resolveNames(named.naming.faces, [faceName], "грань");
  return withTopology(named.shape, (topology) => new Face(getOC().TopoDS.Face(topology.faces[index])));
}

export function facePointsByName(named: NamedShape, faceName: string): Vector3[] {
  const face = faceByName(named, faceName);
  try {
    return face.edges.flatMap((edge) => {
      try {
        return [0, 0.25, 0.5, 0.75, 1].map((position) => {
          const point = edge.pointAt(position);
          try {
            return point.toTuple() as Vector3;
          } finally {
            point.delete();
          }
        });
      } finally {
        edge.delete();
      }
    });
  } finally {
    face.delete();
  }
}
