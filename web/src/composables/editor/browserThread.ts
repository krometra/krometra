import { browserFacePoints } from "@/lib/browserFacePlane";
import type { SavedNaming } from "@/lib/browserNaming";
import type { ThreadCylinderInfo, ThreadOptions, Vec3 } from "@/lib/threadGeometry";
import type { MeshData } from "@/types/api";
import { cloneBrowserWorkerInput, request } from "./useBrowserGeometry";

export interface BrowserThreadFace {
  bodyId: string;
  faceId: string | number;
  facePoints: Vec3[];
}

export type BrowserThreadCylinder =
  | { cylindrical: true; cylinder: ThreadCylinderInfo }
  | { cylindrical: false; reason: string };

export interface BrowserThreadResult {
  step: ArrayBuffer;
  mesh: MeshData;
  naming: SavedNaming;
  shapeHandle: string;
  cylinder: ThreadCylinderInfo;
  depth: number;
  length: number;
}

type ThreadResponseFields = Partial<BrowserThreadResult> & { cylindrical?: boolean; reason?: string };

export function browserThreadFace(mesh: MeshData, bodyId: string, faceId: string | number): BrowserThreadFace {
  return { bodyId, faceId, facePoints: browserFacePoints(mesh, faceId, 12) };
}

export async function describeBrowserThreadCylinder(face: BrowserThreadFace): Promise<BrowserThreadCylinder> {
  const result = (await request({ kind: "thread-cylinder", ...cloneBrowserWorkerInput(face) })) as ThreadResponseFields;
  if (result.cylindrical && result.cylinder) return { cylindrical: true, cylinder: result.cylinder };
  return { cylindrical: false, reason: result.reason ?? "На этой грани резьба не строится." };
}

export async function buildBrowserThread(face: BrowserThreadFace, options: ThreadOptions, featureKey: string): Promise<BrowserThreadResult> {
  const result = (await request({ kind: "thread", ...cloneBrowserWorkerInput({ ...face, options }), featureKey })) as ThreadResponseFields;
  const { step, mesh, naming, shapeHandle, cylinder, depth, length } = result;
  if (!step || !mesh || !naming || !shapeHandle || !cylinder || depth === undefined || length === undefined) {
    throw new Error("Браузерное ядро вернуло неполный результат резьбы.");
  }
  return { step, mesh, naming, shapeHandle, cylinder, depth, length };
}
