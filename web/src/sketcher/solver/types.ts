export interface SketchPoint {
  x: number;
  y: number;
}

export interface SketchEntity {
  id: string;
  type: "line" | "rectangle" | "circle" | "arc" | "infline";
  point?: SketchPoint;
  angle?: number;
  start?: SketchPoint;
  end?: SketchPoint;
  center?: SketchPoint;
  radius?: number;
  corner1?: SketchPoint;
  corner2?: SketchPoint;
  startAngle?: number;
  endAngle?: number;
}

export type ConstraintType =
  | "horizontal" | "vertical" | "coincident"
  | "parallel" | "perpendicular" | "equal"
  | "distance" | "radius" | "angle"
  | "length" | "diameter" | "line_distance" | "point_line_distance"
  | "horizontal_distance" | "vertical_distance";

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

export interface SolverOutput {
  entities: SketchEntity[];
  converged: boolean;
  residual: number;
}
