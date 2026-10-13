import { browserContourPolygon, browserRegions, type BrowserRegion } from "./browserContours";
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

export function browserProfileCenter(profile: BrowserProfile): SketchPoint {
  if (isBrowserCircle(profile)) return profile.center;
  if (isBrowserRectangle(profile)) {
    return { x: (profile.corner1.x + profile.corner2.x) / 2, y: (profile.corner1.y + profile.corner2.y) / 2 };
  }
  const bounds = browserContourPolygon(profile.outer).reduce(
    (result, point) => ({
      minX: Math.min(result.minX, point.x), maxX: Math.max(result.maxX, point.x),
      minY: Math.min(result.minY, point.y), maxY: Math.max(result.maxY, point.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}
