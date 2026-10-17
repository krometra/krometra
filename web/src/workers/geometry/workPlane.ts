import { Edge, getOC } from "replicad";
import { resolveNames } from "@/lib/browserNaming";
import type { SketchSeatPlacement } from "@/lib/browserSketchSeat";
import type { Vec3 } from "@/lib/threadGeometry";
import { WorkPlaneError, type EdgeRef, type FaceRef } from "@/lib/workPlane";
import { reseatWorkPlane, type BodyGeometry, type WorkPlaneSeatStep } from "@/lib/workPlaneSeat";
import { faceByName, withTopology, type NamedShape } from "./naming";
import { planeOf } from "./sketchSeat";

function pointTuple(point: { toTuple(): number[]; delete(): void }): Vec3 {
  try {
    return point.toTuple() as Vec3;
  } finally {
    point.delete();
  }
}

function facePlane(owner: NamedShape, ref: FaceRef) {
  const face = faceByName(owner, ref.faceName);
  try {
    const surface = planeOf(face);
    if (!surface.planar) throw new WorkPlaneError("грань, на которую опирается плоскость, перестала быть плоской.");
    return { point: surface.point, normal: surface.normal };
  } finally {
    face.delete();
  }
}

function edgeLine(owner: NamedShape, ref: EdgeRef) {
  const [index] = resolveNames(owner.naming.edges, [ref.edgeName], "ребро");
  return withTopology(owner.shape, (topology) => {
    const edge = new Edge(getOC().TopoDS.Edge(topology.edges[index]));
    try {
      return { start: pointTuple(edge.startPoint), end: pointTuple(edge.endPoint), straight: edge.geomType === "LINE" };
    } finally {
      edge.delete();
    }
  });
}

export function namedBodyGeometry(owner: NamedShape): BodyGeometry {
  return { face: (ref) => facePlane(owner, ref), edge: (ref) => edgeLine(owner, ref) };
}

export function seatWorkPlane(
  step: WorkPlaneSeatStep,
  owner: NamedShape,
  seatOf: (sketchId: string) => SketchSeatPlacement | undefined,
): SketchSeatPlacement {
  return reseatWorkPlane(step, namedBodyGeometry(owner), seatOf);
}
