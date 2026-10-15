import { fail } from "./protocol";
import type { MirrorBasePlane, MirrorPlane } from "@/lib/mirrorPlane";

export function requestedMirrorPlane(plane: MirrorBasePlane | undefined, offset: number | undefined, faceId: string | undefined): MirrorPlane {
  if ((plane === undefined) === (faceId === undefined)) {
    throw fail("invalid_params", "Задайте ровно одно из двух: plane (XY, XZ, YZ) или faceId плоской грани тела.");
  }
  if (faceId !== undefined) {
    if (offset !== undefined) throw fail("invalid_params", "offset задаётся только вместе с plane: плоскость грани не смещается.");
    return { kind: "face", faceId };
  }
  return { kind: "base", plane: plane as MirrorBasePlane, offset: offset ?? 0 };
}
