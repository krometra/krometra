import type { BrowserExtrudeOperation } from "./browserBoolean";
import { browserProfilesOf } from "./browserProfile";
import { browserSweepSpine, type SweepSketchPlacement } from "./browserSweepPath";

export interface SweepSketchCandidate {
  id: string;
  placement: SweepSketchPlacement;
  used: boolean;
}

export interface SweepSketchChoice {
  profileSketchId: string | null;
  pathSketchId: string | null;
}

export interface SweepSetup {
  profile: SweepSketchCandidate | null;
  path: SweepSketchCandidate | null;
  operation: BrowserExtrudeOperation;
  targetBodyId: string | null;
}

function hasClosedProfile(candidate: SweepSketchCandidate): boolean {
  try {
    return browserProfilesOf(candidate.placement.entities).length > 0;
  } catch {
    return false;
  }
}

export function defaultSweepSketches(candidates: SweepSketchCandidate[], selectedSketchId: string | null): SweepSketchChoice {
  const latestFirst = [...candidates].reverse();
  const free = latestFirst.filter((candidate) => !candidate.used);
  const selected = latestFirst.find((candidate) => candidate.id === selectedSketchId);
  const profile = (selected && hasClosedProfile(selected) ? selected : null) ?? free.find(hasClosedProfile) ?? null;
  const others = latestFirst.filter((candidate) => candidate.id !== profile?.id);
  const path = others.find((candidate) => !candidate.used && !hasClosedProfile(candidate)) ?? others.find((candidate) => !hasClosedProfile(candidate)) ?? null;
  return { profileSketchId: profile?.id ?? null, pathSketchId: path?.id ?? null };
}

export function sweepSetupError(setup: SweepSetup): string | null {
  if (!setup.profile) return "Выберите эскиз профиля — замкнутый контур, который протягивается по пути.";
  if (!setup.path) return "Выберите эскиз пути — цепочку отрезков и дуг, начатую на профиле.";
  if (setup.profile.id === setup.path.id) return "Профиль и путь должны быть в разных эскизах: путь рисуется на другой плоскости.";
  if (setup.operation !== "new_body" && !setup.targetBodyId) return "Выберите целевое тело для операции.";
  try {
    browserSweepSpine(setup.profile.placement, setup.path.placement);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Путь не подходит для протяжки этого профиля.";
  }
}
