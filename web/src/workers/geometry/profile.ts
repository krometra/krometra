import { Plane, Sketcher, sketchCircle, sketchRectangle } from "replicad";
import type { Shape3D } from "replicad";
import { sketchPlaneNormal, type Vector3 } from "@/lib/browserExtrudeFrame";
import type { BrowserContour } from "@/lib/browserContours";
import {
  browserProfileCenter,
  browserProfilesOf,
  isBrowserCircle,
  isBrowserRectangle,
  type BrowserProfile,
} from "@/lib/browserProfile";
import type { SketchEntity, SketchPoint } from "@/types/api";
import { combineShapes } from "./shapes";
import type { Point } from "./types";

type ProfileSketch = ReturnType<typeof sketchCircle>;
type Sweep = (sketch: ProfileSketch) => Shape3D;

function sketchContour(contour: BrowserContour, plane: Plane, center: Point) {
  const local = (point: SketchPoint): [number, number] => [point.x - center.x, point.y - center.y];
  const sketcher = new Sketcher(plane);
  sketcher.movePointerTo(local(contour.start));
  for (const segment of contour.segments) {
    if (segment.kind === "line") sketcher.lineTo(local(segment.end));
    else sketcher.threePointsArcTo(local(segment.end), local(segment.via));
  }
  return sketcher.close();
}

function sketchProfile(profile: BrowserProfile, plane: Plane, center: Point): ProfileSketch {
  if (isBrowserCircle(profile)) return sketchCircle(profile.radius, { plane });
  if (isBrowserRectangle(profile)) {
    return sketchRectangle(
      Math.abs(profile.corner2.x - profile.corner1.x),
      Math.abs(profile.corner2.y - profile.corner1.y),
      { plane },
    );
  }
  return sketchContour(profile.outer, plane, center);
}

function sweepSketch(sketch: ProfileSketch, sweep: Sweep) {
  try {
    return sweep(sketch);
  } finally {
    sketch.delete();
  }
}

function subtractProfileHoles(shape: Shape3D, holes: BrowserContour[], createTool: (hole: BrowserContour) => Shape3D) {
  let resultShape = shape;
  try {
    for (const hole of holes) {
      const tool = createTool(hole);
      try {
        const result = resultShape.cut(tool);
        resultShape.delete();
        resultShape = result;
      } finally {
        tool.delete();
      }
    }
    return resultShape;
  } catch (error) {
    resultShape.delete();
    throw error;
  }
}

function sweepProfile(profile: BrowserProfile, plane: Plane, center: Point, sweep: Sweep) {
  const shape = sweepSketch(sketchProfile(profile, plane, center), sweep);
  if (isBrowserCircle(profile) || isBrowserRectangle(profile)) return shape;
  return subtractProfileHoles(shape, profile.holes, (hole) => sweepSketch(sketchContour(hole, plane, center), sweep));
}

export interface ProfilePlacement {
  origin: Vector3;
  u: Vector3;
  v: Vector3;
  sweep: Sweep;
}

export function sweepSketchProfiles(entities: SketchEntity[], place: (center: Point) => ProfilePlacement) {
  const shapes: Shape3D[] = [];
  try {
    for (const profile of browserProfilesOf(entities)) {
      const center = browserProfileCenter(profile);
      const placement = place(center);
      const plane = new Plane(placement.origin, placement.u, sketchPlaneNormal(placement));
      try {
        shapes.push(sweepProfile(profile, plane, center, placement.sweep));
      } finally {
        plane.delete();
      }
    }
  } catch (error) {
    shapes.forEach((shape) => shape.delete());
    throw error;
  }
  return combineShapes(shapes);
}
