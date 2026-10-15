import { generatedFaceName } from "./browserNaming";
import type { Vec3 } from "./threadGeometry";
import { dot, scale, unit } from "./vec3";

export const MIRROR_BASE_PLANES = ["XY", "XZ", "YZ"] as const;

export type MirrorBasePlane = (typeof MIRROR_BASE_PLANES)[number];

export type MirrorPlane =
  | { kind: "base"; plane: MirrorBasePlane; offset: number }
  | { kind: "face"; faceId: string };

export interface MirrorFrame {
  origin: Vec3;
  normal: Vec3;
}

const BASE_NORMALS: Record<MirrorBasePlane, Vec3> = {
  XY: [0, 0, 1],
  XZ: [0, 1, 0],
  YZ: [1, 0, 0],
};

export function isMirrorBasePlane(value: unknown): value is MirrorBasePlane {
  return typeof value === "string" && (MIRROR_BASE_PLANES as readonly string[]).includes(value);
}

export function basePlaneFrame(plane: MirrorBasePlane, offset: number): MirrorFrame {
  const normal = BASE_NORMALS[plane];
  return { origin: scale(normal, offset), normal };
}

export function reflectionMatrix(frame: MirrorFrame): number[] {
  const n = unit(frame.normal);
  if (!n) throw new Error("Нормаль плоскости зеркала не может быть нулевой.");
  const shift = 2 * dot(frame.origin, n);
  const row = (i: number) => [
    (i === 0 ? 1 : 0) - 2 * n[i] * n[0],
    (i === 1 ? 1 : 0) - 2 * n[i] * n[1],
    (i === 2 ? 1 : 0) - 2 * n[i] * n[2],
    shift * n[i],
  ];
  return [...row(0), ...row(1), ...row(2), 0, 0, 0, 1];
}

export function mirroredFaceName(featureKey: string, faceName: string): string {
  return generatedFaceName(featureKey, `mirror/${faceName}`);
}

export function mirrorFormFields(bodyId: string, plane: MirrorPlane, merge: boolean, documentVersion: number): Record<string, string> {
  const planeFields: Record<string, string> = plane.kind === "face"
    ? { face_id: plane.faceId }
    : { plane: plane.plane, offset: String(plane.offset) };
  return { body_id: bodyId, ...planeFields, merge: String(merge), document_version: String(documentVersion) };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function mirrorPlaneOfParams(params: Record<string, unknown>): MirrorPlane {
  const faceId = text(params.face_id);
  if (faceId) return { kind: "face", faceId };
  const offset = typeof params.offset === "number" && Number.isFinite(params.offset) ? params.offset : 0;
  return { kind: "base", plane: isMirrorBasePlane(params.plane) ? params.plane : "XY", offset };
}

function planeText(plane: MirrorPlane): string {
  if (plane.kind === "face") return "по грани";
  const offset = Number(plane.offset.toFixed(3));
  return offset === 0 ? plane.plane : `${plane.plane} ${offset > 0 ? "+" : "-"}${Math.abs(offset)} мм`;
}

export function mirrorLabel(plane: MirrorPlane, merge: boolean): string {
  return `Зеркало ${planeText(plane)}${merge ? ", с объединением" : ""}`;
}

export function mirrorDetail(params: Record<string, unknown>): string {
  return `${planeText(mirrorPlaneOfParams(params))} · ${params.merge === true ? "объед." : "копия"}`;
}

export function mirrorParams(params: Record<string, unknown>): { label: string; value: string }[] {
  const plane = mirrorPlaneOfParams(params);
  return [
    { label: "Плоскость", value: plane.kind === "face" ? "Плоская грань тела" : plane.plane },
    { label: "Смещение", value: plane.kind === "face" ? "—" : `${Number(plane.offset.toFixed(3))} мм` },
    { label: "Результат", value: params.merge === true ? "Объединено с исходным" : "Новое тело" },
  ];
}
