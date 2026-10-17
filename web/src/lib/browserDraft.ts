import { isMirrorBasePlane, type MirrorBasePlane } from "./mirrorPlane";
import type { Vec3 } from "./threadGeometry";
import { scale } from "./vec3";

export type DraftBasePlane = MirrorBasePlane;

export type DraftNeutral =
  | { kind: "base"; plane: DraftBasePlane }
  | { kind: "face"; faceId: string };

export interface BrowserDraftFeature {
  bodyId: string;
  faceNames: string[];
  neutral: DraftNeutral;
  angleDeg: number;
  reverse: boolean;
}

export const DEFAULT_DRAFT_ANGLE_DEG = 3;
export const MAX_DRAFT_ANGLE_DEG = 90;

const BASE_NORMALS: Record<DraftBasePlane, Vec3> = {
  XY: [0, 0, 1],
  XZ: [0, 1, 0],
  YZ: [1, 0, 0],
};

export function draftAngleError(angleDeg: number): string | null {
  if (!Number.isFinite(angleDeg) || angleDeg <= 0) return "Угол уклона должен быть больше 0°.";
  if (angleDeg >= MAX_DRAFT_ANGLE_DEG) return "Угол уклона должен быть меньше 90°.";
  return null;
}

export function draftParamsError(feature: Pick<BrowserDraftFeature, "faceNames" | "neutral" | "angleDeg">): string | null {
  const angle = draftAngleError(feature.angleDeg);
  if (angle) return angle;
  if (feature.faceNames.length === 0) return "Выберите хотя бы одну грань под уклон.";
  if (new Set(feature.faceNames).size !== feature.faceNames.length) return "Грани уклона не должны повторяться.";
  if (feature.neutral.kind === "face" && feature.faceNames.includes(feature.neutral.faceId)) {
    return "Нейтральная грань не может сама идти под уклон: выберите другую грань или базовую плоскость.";
  }
  return null;
}

export function basePlaneNormal(plane: DraftBasePlane): Vec3 {
  return BASE_NORMALS[plane];
}

export function draftPullDirection(neutral: DraftNeutral, neutralNormal: Vec3, reverse: boolean): Vec3 {
  const pull = neutral.kind === "face" ? scale(neutralNormal, -1) : neutralNormal;
  return reverse ? scale(pull, -1) : pull;
}

export function draftAngleRad(angleDeg: number): number {
  return (angleDeg * Math.PI) / 180;
}

function formatDeg(value: number): string {
  return String(Number(value.toPrecision(6)));
}

export function draftFaceFailureMessage(position: number, reason: "surface" | "parallel" | "angle", angleDeg: number): string {
  const face = `Грань ${position} из списка`;
  if (reason === "surface") return `${face} не поддерживает уклон: наклонить можно только плоские, цилиндрические и конические грани.`;
  if (reason === "parallel") {
    return `${face} параллельна нейтральной плоскости: ей не вокруг чего поворачиваться. Снимите её или выберите другую нейтраль.`;
  }
  return `${face} не наклоняется на ${formatDeg(angleDeg)}°: соседние грани не стыкуются с ней после наклона. Уменьшите угол.`;
}

export function draftFailureMessage(angleDeg: number, fits: number | null): string {
  if (fits !== null) {
    return `Уклон ${formatDeg(angleDeg)}° не строится на этом теле: наклонённые грани пересекаются или выходят за соседние. `
      + `Здесь помещается примерно до ${fits.toFixed(1)}°. Уменьшите угол.`;
  }
  return `Уклон не строится на этом теле ни при каком угле: попробуйте другие грани, нейтральную плоскость или направление.`;
}

function neutralText(neutral: DraftNeutral): string {
  return neutral.kind === "face" ? "от грани" : `от ${neutral.plane}`;
}

export function draftLabel(angleDeg: number, neutral: DraftNeutral): string {
  return `Уклон ${formatDeg(angleDeg)}° ${neutralText(neutral)}`;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function draftNeutralOfParams(params: Record<string, unknown>): DraftNeutral {
  const faceId = text(params.neutral_face_id);
  if (faceId) return { kind: "face", faceId };
  return { kind: "base", plane: isMirrorBasePlane(params.neutral_plane) ? params.neutral_plane : "XY" };
}

export function draftAngleOfParams(params: Record<string, unknown>): number {
  return typeof params.angle_deg === "number" && Number.isFinite(params.angle_deg) ? params.angle_deg : DEFAULT_DRAFT_ANGLE_DEG;
}

export function draftFeatureOfParams(params: Record<string, unknown>): Omit<BrowserDraftFeature, "bodyId"> & { bodyId: string | null } {
  return {
    bodyId: text(params.target_body_id),
    faceNames: Array.isArray(params.face_ids) ? params.face_ids.map(String) : [],
    neutral: draftNeutralOfParams(params),
    angleDeg: draftAngleOfParams(params),
    reverse: params.reverse === true,
  };
}

export function draftFormFields(feature: BrowserDraftFeature, documentVersion: number): Record<string, string> {
  const neutral: Record<string, string> = feature.neutral.kind === "face"
    ? { neutral_face_id: feature.neutral.faceId }
    : { neutral_plane: feature.neutral.plane };
  return {
    body_id: feature.bodyId,
    face_ids: JSON.stringify(feature.faceNames),
    ...neutral,
    angle_deg: String(feature.angleDeg),
    reverse: String(feature.reverse),
    document_version: String(documentVersion),
  };
}

export interface DraftFaceSelection {
  bodyId: string | null;
  faceIds: string[];
}

export function toggleDraftFaces(selection: DraftFaceSelection, bodyId: string, group: string[]): DraftFaceSelection {
  const unique = [...new Set(group)];
  if (selection.bodyId !== bodyId) return { bodyId: unique.length > 0 ? bodyId : null, faceIds: unique };
  const selected = new Set(selection.faceIds);
  const remove = unique.length > 0 && unique.every((face) => selected.has(face));
  const faceIds = remove
    ? selection.faceIds.filter((face) => !unique.includes(face))
    : [...selection.faceIds, ...unique.filter((face) => !selected.has(face))];
  return { bodyId: faceIds.length > 0 ? bodyId : null, faceIds };
}

export function draftDetail(params: Record<string, unknown>): string {
  const count = Array.isArray(params.face_ids) ? params.face_ids.length : 0;
  return `${formatDeg(draftAngleOfParams(params))}° · ${neutralText(draftNeutralOfParams(params))} · граней: ${count}`;
}

export function draftParams(params: Record<string, unknown>): { label: string; value: string }[] {
  const neutral = draftNeutralOfParams(params);
  return [
    { label: "Нейтраль", value: neutral.kind === "face" ? "Плоская грань тела" : neutral.plane },
    { label: "Граней", value: String(Array.isArray(params.face_ids) ? params.face_ids.length : 0) },
    { label: "Направление", value: params.reverse === true ? "Обратное" : "По нормали" },
  ];
}
