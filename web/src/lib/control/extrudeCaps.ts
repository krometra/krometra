import type { Vec3 } from "@/lib/threadGeometry";
import type { BrowserExtrudeSpan } from "@/lib/browserExtrudeExtent";
import type { TopologyFace } from "./topology";

const PARALLEL = 0.999;

export interface ExtrudeCaps {
  capFaceIds: string[];
  baseFaceIds: string[];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function offsetOf(face: TopologyFace, origin: Vec3, normal: Vec3): number | null {
  if (!face.planar || !face.normal || !face.point) return null;
  if (Math.abs(dot(face.normal, normal)) < PARALLEL) return null;
  return dot([face.point[0] - origin[0], face.point[1] - origin[1], face.point[2] - origin[2]], normal);
}

function facesAt(faces: TopologyFace[], origin: Vec3, normal: Vec3, offsets: number[]): string[] {
  return faces
    .filter((face) => {
      const offset = offsetOf(face, origin, normal);
      return offset !== null && offsets.some((target) => Math.abs(offset - target) <= 1e-4 * Math.max(1, Math.abs(target)));
    })
    .map((face) => face.id);
}

export function extrudeCaps(faces: TopologyFace[], frame: { origin: Vec3; n: Vec3 }, span: BrowserExtrudeSpan): ExtrudeCaps {
  const ends = [span.start, span.end].filter((offset) => Math.abs(offset) > 1e-9);
  const base = [span.start, span.end].some((offset) => Math.abs(offset) <= 1e-9) ? [0] : [];
  return {
    capFaceIds: facesAt(faces, frame.origin, frame.n, ends),
    baseFaceIds: base.length > 0 ? facesAt(faces, frame.origin, frame.n, base) : [],
  };
}
