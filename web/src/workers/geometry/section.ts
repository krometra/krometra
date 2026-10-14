import { cast, getOC } from "replicad";
import type { Shape3D } from "replicad";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import { initOcct } from "./occt";
import { bodyShape } from "./shapes";

const EDGE_MESH = { tolerance: 0.01, angularTolerance: 0.2 };

export interface SectionRequest {
  id: number;
  kind: "section";
  bodyIds: string[];
  origin: Vector3;
  normal: Vector3;
}

export interface BodySection {
  bodyId: string;
  polylines: number[][];
}

function sectionPolylines(shape: Shape3D, origin: Vector3, normal: Vector3): number[][] {
  const oc = getOC();
  const point = new oc.gp_Pnt(origin[0], origin[1], origin[2]);
  const direction = new oc.gp_Dir(normal[0], normal[1], normal[2]);
  const plane = new oc.gp_Pln(point, direction);
  const algorithm = new oc.BRepAlgoAPI_Section(shape.wrapped, plane, true);
  try {
    if (algorithm.HasErrors()) throw new Error("Браузерное ядро не смогло построить сечение.");
    const section = cast(algorithm.Shape());
    try {
      const { lines, edgeGroups } = section.meshEdges(EDGE_MESH);
      return edgeGroups.map((group) => lines.slice(group.start * 3, (group.start + group.count) * 3));
    } finally {
      section.delete();
    }
  } finally {
    algorithm.delete();
    plane.delete();
    direction.delete();
    point.delete();
  }
}

export async function sectionBodies(request: SectionRequest): Promise<BodySection[]> {
  await initOcct();
  return request.bodyIds.map((bodyId) => ({
    bodyId,
    polylines: sectionPolylines(bodyShape(bodyId), request.origin, request.normal),
  }));
}
