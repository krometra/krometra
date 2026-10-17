import type { PlaneBasis, SketchEntity, SketchPlane } from "@/types/api";
import type { BrowserExtrudeOperation } from "./browserBoolean";
import { browserPlaneFrame } from "./browserExtrudeFrame";
import { browserProfilesOf, isBrowserCircle, isBrowserRectangle, type BrowserProfile } from "./browserProfile";

export type LoftTransition = "smooth" | "ruled";

export interface LoftSketchPlacement {
  entities: SketchEntity[];
  plane: SketchPlane;
  planeOffset: number;
  planeBasis: PlaneBasis | null;
}

export interface LoftSketchCandidate {
  id: string;
  label: string;
  placement: LoftSketchPlacement;
  used: boolean;
}

export interface LoftSetup {
  profiles: LoftSketchCandidate[];
  operation: BrowserExtrudeOperation;
  targetBodyId: string | null;
}

const PARALLEL = 1e-9;
const SAME_PLANE = 1e-6;

export function loftProfileOf(entities: SketchEntity[], label: string): BrowserProfile {
  let profiles: BrowserProfile[];
  try {
    profiles = browserProfilesOf(entities);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "нет замкнутого контура.";
    throw new Error(`Эскиз «${label}» не подходит для лофта: ${reason}`);
  }
  if (profiles.length > 1) {
    throw new Error(`В эскизе «${label}» ${profiles.length} замкнутых области: профиль лофта - ровно один контур. Оставьте один или вынесите остальные в отдельные эскизы.`);
  }
  const [profile] = profiles;
  if (!isBrowserCircle(profile) && !isBrowserRectangle(profile) && profile.holes.length > 0) {
    throw new Error(`Профиль «${label}» с отверстием: лофт строится по одному внешнему контуру без отверстий.`);
  }
  return profile;
}

function hasSingleProfile(candidate: LoftSketchCandidate): boolean {
  try {
    loftProfileOf(candidate.placement.entities, candidate.label);
    return true;
  } catch {
    return false;
  }
}

function frameOf(placement: LoftSketchPlacement) {
  return browserPlaneFrame({ ...placement, center: { x: 0, y: 0 } });
}

export function sameLoftPlane(a: LoftSketchPlacement, b: LoftSketchPlacement): boolean {
  const first = frameOf(a);
  const second = frameOf(b);
  const [ax, ay, az] = first.n;
  const [bx, by, bz] = second.n;
  const cross = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  if (cross > PARALLEL) return false;
  const gap = second.origin.map((value, axis) => value - first.origin[axis]);
  return Math.abs(gap[0] * ax + gap[1] * ay + gap[2] * az) < SAME_PLANE;
}

export function defaultLoftSketches(candidates: LoftSketchCandidate[], selectedSketchId: string | null): string[] {
  const suitable = candidates.filter(hasSingleProfile);
  const selected = suitable.find((candidate) => candidate.id === selectedSketchId);
  const ordered = [
    ...(selected ? [selected] : []),
    ...suitable.filter((candidate) => !candidate.used && candidate !== selected),
    ...suitable.filter((candidate) => candidate.used && candidate !== selected),
  ];
  const chosen: LoftSketchCandidate[] = [];
  for (const candidate of ordered) {
    const free = !candidate.used || candidate === selected;
    if (!free && chosen.length >= 2) break;
    if (chosen.some((taken) => sameLoftPlane(taken.placement, candidate.placement))) continue;
    chosen.push(candidate);
  }
  const position = new Map(candidates.map((candidate, index) => [candidate.id, index]));
  return chosen.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0)).map((candidate) => candidate.id);
}

export function loftSetupError(setup: LoftSetup): string | null {
  const { profiles } = setup;
  if (profiles.length < 2) return "Добавьте профили: лофт строится минимум по двум эскизам на разных плоскостях.";
  const seen = new Set<string>();
  for (const profile of profiles) {
    if (seen.has(profile.id)) return `Эскиз «${profile.label}» добавлен в лофт дважды.`;
    seen.add(profile.id);
  }
  for (const profile of profiles) {
    try {
      loftProfileOf(profile.placement.entities, profile.label);
    } catch (error) {
      return error instanceof Error ? error.message : `Эскиз «${profile.label}» не подходит для лофта.`;
    }
  }
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      if (sameLoftPlane(profiles[i].placement, profiles[j].placement)) {
        return `Профили «${profiles[i].label}» и «${profiles[j].label}» лежат в одной плоскости: каждый профиль лофта рисуется на своей плоскости.`;
      }
    }
  }
  if (setup.operation !== "new_body" && !setup.targetBodyId) return "Выберите целевое тело для операции.";
  return null;
}

export function withLoftProfile(ids: string[], sketchId: string): string[] {
  return ids.includes(sketchId) ? ids : [...ids, sketchId];
}

export function withoutLoftProfile(ids: string[], index: number): string[] {
  return ids.filter((_, position) => position !== index);
}

export function movedLoftProfile(ids: string[], index: number, step: -1 | 1): string[] {
  const target = index + step;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function loftTransitionOf(value: unknown): LoftTransition {
  return value === "ruled" ? "ruled" : "smooth";
}
