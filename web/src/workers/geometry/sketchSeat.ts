import { getOC } from "replicad";
import type { Face } from "replicad";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import {
  reseatSketchPlane,
  seatFaceIndex,
  type SeatSurface,
  type SketchSeatPlacement,
  type SketchSeatStep,
} from "@/lib/browserSketchSeat";
import { faceByName, type NamedShape } from "./naming";

function planeOf(face: Face): SeatSurface {
  if (face.geomType !== "PLANE") return { planar: false };
  const adaptor = new (getOC().BRepAdaptor_Surface)(face.wrapped, false);
  try {
    const plane = adaptor.Plane();
    const location = plane.Location();
    const axis = plane.Axis();
    const direction = axis.Direction();
    try {
      const outward = face.orientation === "backward" ? -1 : 1;
      return {
        planar: true,
        point: [location.X(), location.Y(), location.Z()],
        normal: [direction.X() * outward, direction.Y() * outward, direction.Z() * outward] as Vector3,
      };
    } finally {
      direction.delete();
      axis.delete();
      location.delete();
      plane.delete();
    }
  } finally {
    adaptor.delete();
  }
}

export function seatSketchOnFace(step: SketchSeatStep, owner: NamedShape): SketchSeatPlacement {
  seatFaceIndex(owner.naming.faces, step);
  const face = faceByName(owner, step.faceName);
  try {
    return reseatSketchPlane(step.placement, planeOf(face), step.label);
  } finally {
    face.delete();
  }
}
