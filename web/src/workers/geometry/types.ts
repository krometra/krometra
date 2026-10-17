import type { BrowserBooleanOperation, BrowserExtrudeOperation } from "@/lib/browserBoolean";
import type { BrowserExtentType, BrowserExtrudeDirection } from "@/lib/browserExtrudeExtent";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import type { MeshTolerance } from "@/lib/meshQuality";
import type { SavedNaming } from "@/lib/browserNaming";
import type { SketchEntity } from "@/types/api";
import type { EdgeFeature } from "./edgeOps";
import type { HoleBuildRequest } from "./hole";
import type { NamedShape } from "./naming";
import type { ThreadWorkerRequest } from "./thread";

export type BodyLookup = (bodyId: string | null) => NamedShape;

export type Point = { x: number; y: number };

type PlaneBasis = { origin: Vector3; u: Vector3; v: Vector3; n: Vector3 };

export interface SketchPlacement {
  entities: SketchEntity[];
  plane: "XY" | "XZ" | "YZ";
  planeOffset: number;
  planeBasis: PlaneBasis | null;
}

export interface ExtrudeRequest extends SketchPlacement {
  id: number;
  kind: "extrude";
  distance: number;
  direction: BrowserExtrudeDirection;
  extentType: BrowserExtentType;
  backDistance: number;
  offset: number;
  operation: BrowserExtrudeOperation;
  targetBodyId: string | null;
  upToBodyId: string | null;
  upToFaceId: string | number | null;
  upToFacePoints: Vector3[] | null;
  profileRegions?: string[] | null;
  featureKey: string;
}

export interface RevolveRequest extends SketchPlacement {
  id: number;
  kind: "revolve";
  axisOrigin: Point;
  axis: "x" | "y";
  angle: number;
  direction: "one_side" | "symmetric";
  profileRegions?: string[] | null;
  featureKey: string;
}

export interface BooleanRequest {
  id: number;
  kind: "boolean";
  operation: BrowserBooleanOperation;
  targetBodyId: string;
  toolBodyId: string;
  featureKey: string;
}

export type EdgeFeatureRequest = EdgeFeature & {
  id: number;
  bodyId: string;
  featureKey: string;
};

export interface ExportRequest {
  id: number;
  kind: "export";
  format: "step" | "stl" | "3mf";
  bodyIds: string[];
  mesh?: MeshTolerance;
  names?: string[];
}

export interface ShapeRequest {
  id: number;
  kind: "init" | "retain" | "discard" | "release" | "hydrate";
  shapeHandle?: string;
  bodyId?: string;
  step?: ArrayBuffer;
  naming?: SavedNaming | null;
}

export type WorkerRequest =
  | ExtrudeRequest
  | RevolveRequest
  | BooleanRequest
  | EdgeFeatureRequest
  | ExportRequest
  | ShapeRequest
  | ThreadWorkerRequest
  | HoleBuildRequest;
