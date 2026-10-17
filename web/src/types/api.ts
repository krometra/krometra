// API-типы.
//
// Всё, что однозначно соответствует Pydantic-схеме backend, — алиасы на
// сгенерированный `api.generated.ts` (`npm run gen:api`), чтобы контракт не
// расходился молча. Руками здесь описывается только то, чего в схеме нет или
// что на клиенте сужено (например `Record<string, unknown>` вместо `unknown`).
import type { components } from "./api.generated";

type Schemas = components["schemas"];

export type User = Schemas["UserResponse"];
export type RegisterResponse = Schemas["RegisterResponse"];
export type TokenResponse = Schemas["TokenResponse"];
export type Project = Schemas["ProjectResponse"];
export type ProjectListResponse = Schemas["ProjectListResponse"];
export type ProjectCreate = Schemas["ProjectCreate"];
export type ProjectUpdate = Schemas["ProjectUpdate"];
export type ApiKey = Schemas["ApiKeyResponse"];
export type ApiKeyCreated = Schemas["ApiKeyCreated"];
export type ApiKeyListResponse = Schemas["ApiKeyListResponse"];

export interface ApiError {
  error: string;
  error_description?: string;
}

// Document types
export interface Document {
  id: string;
  project_id: string;
  components: Record<string, unknown>;
  timeline: TimelineEntry[];
  metadata: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentUpdate {
  components?: Record<string, unknown>;
  timeline?: TimelineEntry[];
  metadata?: Record<string, unknown>;
  version: number;
}

export interface TimelineEntry {
  id: string;
  timestamp: string;
  kind: "sketch" | "extrude" | "boolean" | "revolve" | "sweep" | "loft" | "fillet" | "chamfer" | "thread" | "import" | "transform" | "shell" | "mirror" | "hole" | "pattern" | "draft" | "press_pull";
  label: string;
  status: "ok" | "warning" | "error" | "dirty";
  sketch_id?: string;
  body_id?: string;
  body_ids?: string[];
  result_body_id?: string;
  target_body_id?: string;
  tool_body_id?: string;
  plane?: string;
  entity_count?: number;
  operation?: string;
  params?: Record<string, unknown>;
  suppressed?: boolean;
  rolled_back?: boolean;
  error_message?: string;
}

// Revolve types
export interface RevolveResponse {
  body_id: string;
  mesh: MeshData;
}

// Extrude types
export type ExtrudeOperation = "new_body" | "join" | "cut";

export interface ExtrudeResponse {
  body_id: string;
  mesh: MeshData;
  hidden_body_ids?: string[];
}

// Boolean / CSG types
export type BooleanOperation = "union" | "subtract" | "intersect";
export type BooleanResponse = Schemas["BooleanResponse"];
export type ImportResponse = Schemas["ImportResponse"];

// Geometry types
export type BrepTopoEdge = Schemas["BrepTopoEdge"];
export type BrepTopoFace = Schemas["BrepTopoFace"];
export type BrepTopo = Schemas["BrepTopo"];
export type BBox = Schemas["BBox"];
export type MeshData = Schemas["MeshResponse"];

// Sketch types (2D Sketcher)
export interface SketchPoint {
  x: number;
  y: number;
}

export interface SketchLine {
  id: string;
  type: "line";
  start: SketchPoint;
  end: SketchPoint;
  construction?: boolean;
}

export interface SketchInfiniteLine {
  id: string;
  type: "infline";
  point: SketchPoint;
  angle: number;
}

export interface SketchCircle {
  id: string;
  type: "circle";
  center: SketchPoint;
  radius: number;
  construction?: boolean;
}

export interface SketchArc {
  id: string;
  type: "arc";
  center: SketchPoint;
  radius: number;
  startAngle: number;
  endAngle: number;
  construction?: boolean;
}

export interface SketchRectangle {
  id: string;
  type: "rectangle";
  corner1: SketchPoint;
  corner2: SketchPoint;
  construction?: boolean;
}

export type SketchEntity = SketchLine | SketchCircle | SketchArc | SketchRectangle | SketchInfiniteLine;

export type SketchPlane = "XY" | "XZ" | "YZ";

export interface PlaneBasis {
  origin: number[];
  u: number[];
  v: number[];
  n: number[];
}

export interface SketchData {
  plane: SketchPlane;
  plane_offset?: number;
  plane_basis?: PlaneBasis | null;
  ref_body_id?: string | null;
  ref_face_id?: string | number | null;
  ref_plane_id?: string | null;
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}

export interface SketchSaveResponse {
  sketch_id: string;
  version: number;
}

// Constraint types
export type ConstraintType =
  | "horizontal" | "vertical" | "coincident"
  | "parallel" | "perpendicular" | "equal"
  | "distance" | "radius" | "angle"
  | "length" | "diameter" | "line_distance" | "point_line_distance"
  | "horizontal_distance" | "vertical_distance"
  | "collinear" | "midpoint" | "point_on_curve" | "fix";

export interface ConstraintRef {
  entity_id: string;
  sub_index: number;
}

export interface SketchConstraint {
  id: string;
  type: ConstraintType;
  anchors: ConstraintRef[];
  value: number | null;
}

export interface FilletRequest {
  body_id: string;
  edge_ids: (string | number)[];
  radius: number;
}

export interface FilletResponse {
  body_id: string;
  mesh: MeshData;
}

export interface ChamferRequest {
  body_id: string;
  edge_ids: (string | number)[];
  distance1: number;
  distance2: number;
}

export interface ChamferResponse {
  body_id: string;
  mesh: MeshData;
}

export type ThreadResponse = Schemas["ThreadResponse"];
export type HoleResponse = Schemas["HoleResponse"];

export interface ThreadCylinderResponse {
  cylindrical: boolean;
  radius?: number | null;
  origin?: number[] | null;
  direction?: number[] | null;
  start?: number | null;
  length?: number | null;
  external?: boolean | null;
  reason?: string | null;
}

// Parameter (parametric expressions)
export interface Parameter {
  id: string;
  name: string;
  value: number;
  unit: string;
}
