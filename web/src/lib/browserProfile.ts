import { browserContourPolygon, browserRegions, type BrowserRegion } from "./browserContours";
import { sweepProbes, type SweepProbe } from "./browserSweepNaming";
import { mergedProfileOf } from "./sketchRegions";
import { isConstruction } from "@/sketcher/geometry";
import type { SketchEntity, SketchPoint } from "@/types/api";

type Circle = Extract<SketchEntity, { type: "circle" }>;
type Rectangle = Extract<SketchEntity, { type: "rectangle" }>;

export type BrowserProfile = Circle | Rectangle | BrowserRegion;

export function isBrowserCircle(profile: BrowserProfile): profile is Circle {
  return "type" in profile && profile.type === "circle";
}

export function isBrowserRectangle(profile: BrowserProfile): profile is Rectangle {
  return "type" in profile && profile.type === "rectangle";
}

export function browserProfilesOf(entities: SketchEntity[]): BrowserProfile[] {
  const visible = entities.filter((entity) => !isConstruction(entity));
  if (visible.length === 1 && (visible[0].type === "circle" || visible[0].type === "rectangle")) {
    return [visible[0]];
  }
  const regions = browserRegions(visible);
  if (regions.length === 0) throw new Error("В эскизе нет замкнутого контура.");
  return regions;
}

export function hasProfileRegions(keys: string[] | null | undefined): keys is string[] {
  return Array.isArray(keys) && keys.length > 0;
}

export function browserProfileSelection(
  entities: SketchEntity[],
  regionKeys: string[] | null | undefined,
): { profiles: BrowserProfile[]; probes: SweepProbe[] } {
  if (!hasProfileRegions(regionKeys)) return { profiles: browserProfilesOf(entities), probes: sweepProbes(entities) };
  const merged = mergedProfileOf(entities, regionKeys);
  return { profiles: merged.regions, probes: merged.probes };
}

export interface BrowserProfileBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function browserProfileBounds(profile: BrowserProfile): BrowserProfileBounds {
  if (isBrowserCircle(profile)) {
    const { center, radius } = profile;
    return { minX: center.x - radius, maxX: center.x + radius, minY: center.y - radius, maxY: center.y + radius };
  }
  const points = isBrowserRectangle(profile) ? [profile.corner1, profile.corner2] : browserContourPolygon(profile.outer);
  return points.reduce(
    (result, point) => ({
      minX: Math.min(result.minX, point.x), maxX: Math.max(result.maxX, point.x),
      minY: Math.min(result.minY, point.y), maxY: Math.max(result.maxY, point.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
}

export function browserProfileCenter(profile: BrowserProfile): SketchPoint {
  if (isBrowserCircle(profile)) return profile.center;
  const bounds = browserProfileBounds(profile);
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}
