import { describeBodyTopology } from "@/lib/control/topology";
import type { MeshData } from "@/types/api";

export type ShellDirection = "inward" | "outward";

export interface BrowserShellFeature {
  bodyId: string;
  faceNames: string[];
  thickness: number;
  direction: ShellDirection;
}

export interface ShellFaceSelection {
  bodyId: string | null;
  faceIds: (string | number)[];
}

export interface ShellFaceRow {
  faceId: string | number;
  label: string;
}

export const SHELL_DIRECTIONS: readonly ShellDirection[] = ["inward", "outward"];

const VOLUME_TOLERANCE = 1e-6;
const OFFSET_ABSOLUTE_TOLERANCE = 0.01;
const OFFSET_RELATIVE_TOLERANCE = 0.01;

export function isShellDirection(value: unknown): value is ShellDirection {
  return SHELL_DIRECTIONS.includes(value as ShellDirection);
}

export function shellParamsError(feature: Pick<BrowserShellFeature, "faceNames" | "thickness" | "direction">): string | null {
  if (!Number.isFinite(feature.thickness) || feature.thickness <= 0) return "Толщина стенки оболочки должна быть больше нуля.";
  if (!isShellDirection(feature.direction)) return "Оболочка строится внутрь или наружу тела.";
  if (feature.faceNames.length === 0) return "Выберите хотя бы одну грань, которую оболочка откроет.";
  if (new Set(feature.faceNames).size !== feature.faceNames.length) return "Грани оболочки не должны повторяться.";
  return null;
}

export function shellOffset(thickness: number, direction: ShellDirection): number {
  return direction === "inward" ? -thickness : thickness;
}

export function shellVolumeFits(sourceVolume: number, resultVolume: number, direction: ShellDirection): boolean {
  if (!Number.isFinite(resultVolume) || resultVolume <= 0) return false;
  return direction === "outward" || resultVolume < sourceVolume * (1 - VOLUME_TOLERANCE);
}

export function wallMatchesThickness(distance: number, thickness: number): boolean {
  const tolerance = Math.max(OFFSET_ABSOLUTE_TOLERANCE, thickness * OFFSET_RELATIVE_TOLERANCE);
  return Math.abs(distance - thickness) <= tolerance;
}

function formatMm(value: number): string {
  return String(Number(value.toPrecision(6)));
}

export function shellFailureMessage(thickness: number, direction: ShellDirection, fits: number | null): string {
  const side = direction === "inward" ? "внутрь" : "наружу";
  if (fits !== null) {
    return `Толщина стенки ${formatMm(thickness)} мм больше допустимой для этого тела: оболочка ${side} помещается `
      + `примерно до ${fits.toFixed(1)} мм. Уменьшите толщину.`;
  }
  return `Оболочка ${side} не строится на этом теле ни при какой толщине: попробуйте открыть другие грани `
    + "или сменить направление.";
}

export function shellLabel(thickness: number, direction: ShellDirection): string {
  return `Оболочка ${formatMm(thickness)}мм ${direction === "inward" ? "внутрь" : "наружу"}`;
}

export function toggleShellFace(selection: ShellFaceSelection, bodyId: string, faceId: string | number): ShellFaceSelection {
  if (selection.bodyId !== bodyId) return { bodyId, faceIds: [faceId] };
  const faceIds = selection.faceIds.includes(faceId)
    ? selection.faceIds.filter((id) => id !== faceId)
    : [...selection.faceIds, faceId];
  return { bodyId: faceIds.length > 0 ? bodyId : null, faceIds };
}

function faceKindLabel(planar: boolean): string {
  return planar ? "Плоская грань" : "Криволинейная грань";
}

export function shellFaceRows(mesh: MeshData | null, faceIds: (string | number)[]): ShellFaceRow[] {
  const faces = mesh ? describeBodyTopology("", mesh).faces : [];
  return faceIds.map((faceId) => {
    const face = faces.find((candidate) => candidate.id === String(faceId));
    if (!face) return { faceId, label: "Грань" };
    return { faceId, label: `${faceKindLabel(face.planar)} · ${formatMm(Number(face.area.toFixed(1)))} мм²` };
  });
}
