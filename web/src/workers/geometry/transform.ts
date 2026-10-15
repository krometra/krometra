import { getOC } from "replicad";
import type { gp_Trsf } from "replicad-opencascadejs";
import type { BodyTransform } from "@/lib/bodyTransform";
import { shape3DOf } from "./boolean";
import { namedFromHistory, type NamedShape } from "./naming";
import type { BodyLookup } from "./types";

export interface TransformRequest extends BodyTransform {
  id: number;
  kind: "transform";
  bodyId: string;
  featureKey: string;
}

function rotation(transform: BodyTransform): gp_Trsf {
  const oc = getOC();
  const trsf = new oc.gp_Trsf();
  if (!transform.rotate) return trsf;
  const { axis, angle, origin } = transform.rotate;
  const point = new oc.gp_Pnt(origin[0], origin[1], origin[2]);
  const direction = new oc.gp_Dir(axis[0], axis[1], axis[2]);
  const ax1 = new oc.gp_Ax1(point, direction);
  try {
    trsf.SetRotation(ax1, (angle * Math.PI) / 180);
    return trsf;
  } finally {
    ax1.delete();
    direction.delete();
    point.delete();
  }
}

export function movement(transform: BodyTransform): gp_Trsf {
  const oc = getOC();
  const trsf = rotation(transform);
  const [x, y, z] = transform.translate;
  const vector = new oc.gp_Vec(x, y, z);
  const translation = new oc.gp_Trsf();
  try {
    translation.SetTranslation(vector);
    translation.Multiply(trsf);
    return translation;
  } finally {
    trsf.delete();
    vector.delete();
  }
}

export function transformNamed(request: TransformRequest, lookup: BodyLookup): NamedShape {
  const oc = getOC();
  const source = lookup(request.bodyId);
  const trsf = movement(request);
  const algorithm = new oc.BRepBuilderAPI_Transform(source.shape.wrapped, trsf, true, false);
  try {
    if (!algorithm.IsDone()) throw new Error("Браузерное ядро не смогло переместить тело.");
    const result = shape3DOf(algorithm.Shape(), "Результат перемещения не является телом.");
    return namedFromHistory({ algorithm, inputs: [source], result, featureKey: request.featureKey });
  } finally {
    algorithm.delete();
    trsf.delete();
  }
}
