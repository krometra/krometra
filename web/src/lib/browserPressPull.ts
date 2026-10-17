export interface BrowserPressPullFeature {
  bodyId: string;
  faceNames: string[];
  distance: number;
  newBody: boolean;
}

export type PressPullOperation = "union" | "subtract";

export const PRESS_PULL_MAX_FACES = 64;
export const PRESS_PULL_MIN_DISTANCE = 1e-4;
const VOLUME_TOLERANCE = 1e-7;

const SURFACE_LABELS: Record<string, string> = {
  CONE: "коническая",
  SPHERE: "сферическая",
  TORUS: "тороидальная",
  BEZIER_SURFACE: "сплайновая",
  BSPLINE_SURFACE: "сплайновая",
  REVOLUTION_SURFACE: "поверхность вращения",
  EXTRUSION_SURFACE: "поверхность выдавливания",
  OFFSET_SURFACE: "эквидистантная",
};

export function pressPullParamsError(feature: Pick<BrowserPressPullFeature, "faceNames" | "distance">): string | null {
  if (!Number.isFinite(feature.distance) || Math.abs(feature.distance) < PRESS_PULL_MIN_DISTANCE) {
    return "Смещение грани не может быть нулевым: плюс сдвигает грань наружу, минус внутрь тела.";
  }
  if (feature.faceNames.length === 0) return "Выберите хотя бы одну грань тела.";
  if (feature.faceNames.length > PRESS_PULL_MAX_FACES) return `Одной операцией можно сдвинуть не больше ${PRESS_PULL_MAX_FACES} граней.`;
  if (new Set(feature.faceNames).size !== feature.faceNames.length) return "Грани не должны повторяться.";
  return null;
}

export function pressPullOperation(distance: number): PressPullOperation {
  return distance > 0 ? "union" : "subtract";
}

export function isPressPullSurface(surfaceType: string): boolean {
  return surfaceType === "PLANE" || surfaceType === "CYLINDRE";
}

export function unsupportedSurfaceMessage(surfaceType: string): string {
  const label = SURFACE_LABELS[surfaceType] ?? "криволинейная";
  return `Сдвиг работает с плоскими и цилиндрическими гранями, а эта грань ${label}. Выберите другую грань.`;
}

export function pressPullVolumeChanged(sourceVolume: number, resultVolume: number, distance: number): boolean {
  if (!Number.isFinite(resultVolume) || resultVolume <= 0) return false;
  const margin = Math.max(sourceVolume, 1) * VOLUME_TOLERANCE;
  return distance > 0 ? resultVolume > sourceVolume + margin : resultVolume < sourceVolume - margin;
}

export function pressPullFailureMessage(distance: number): string {
  return distance > 0
    ? "Сдвиг грани наружу не добавил материала: грань упирается в само тело. Попробуйте другое смещение."
    : "Сдвиг грани внутрь не построился: смещение больше толщины тела за гранью. Уменьшите смещение.";
}

export function formatSignedMm(value: number): string {
  const text = String(Number(value.toPrecision(6)));
  return value > 0 ? `+${text}` : text;
}

export function pressPullLabel(distance: number, newBody: boolean): string {
  return newBody ? `Выдавить грань ${formatSignedMm(distance)}мм` : `Сдвиг грани ${formatSignedMm(distance)}мм`;
}

export function axialLevels(projections: number[], tolerance: number): number[] | null {
  const levels: number[] = [];
  for (const value of projections) {
    if (!levels.some((level) => Math.abs(level - value) <= tolerance)) levels.push(value);
    if (levels.length > 2) return null;
  }
  return levels.length === 2 ? levels.sort((a, b) => a - b) : null;
}

export function tubeRadii(radius: number, external: boolean, distance: number): { inner: number; outer: number } | null {
  const moved = radius + (external ? distance : -distance);
  if (!(moved > PRESS_PULL_MIN_DISTANCE)) return null;
  return { inner: Math.min(radius, moved), outer: Math.max(radius, moved) };
}

function signedDistanceOf(params: Record<string, unknown>): string {
  return typeof params.distance === "number" ? `${formatSignedMm(params.distance)} мм` : "?";
}

export function pressPullParamRows(params: Record<string, unknown>): { label: string; value: string }[] {
  return [
    { label: "Смещение", value: signedDistanceOf(params) },
    { label: "Результат", value: params.new_body === true ? "Новое тело" : "Сдвиг граней тела" },
    { label: "Граней", value: String(Array.isArray(params.face_ids) ? params.face_ids.length : 0) },
  ];
}

export function pressPullDetail(params: Record<string, unknown>): string {
  const faces = Array.isArray(params.face_ids) ? params.face_ids.length : 0;
  return `${signedDistanceOf(params)} · ${params.new_body === true ? "новое тело" : `${faces} гр.`}`;
}

export function pressPullDirectionHint(distance: number, newBody: boolean): string {
  if (newBody) return distance > 0 ? "Грань выдавливается наружу в новое тело" : "Грань выдавливается внутрь, в новое тело";
  return distance > 0 ? "Грань уходит наружу: тело растёт" : "Грань уходит внутрь: тело худеет, отверстие расширяется";
}
