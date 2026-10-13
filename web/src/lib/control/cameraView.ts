import { INVALID, param, type ParamSpec, type Vec3 } from "./params";
import { fail } from "./protocol";

export interface CameraViewInput {
  position: Vec3;
  target?: Vec3;
  up?: Vec3;
}

export interface ResolvedCameraView {
  position: Vec3;
  target: Vec3;
  up: Vec3;
}

const VIEW_KEYS = ["position", "target", "up"];
const VIEW_FORMAT = "объект { position: [x,y,z], target?: [x,y,z], up?: [x,y,z] } в мм";
const MIN_LENGTH = 1e-9;
const vector = param.vec3("");

function optionalVector(value: unknown): Vec3 | undefined | typeof INVALID {
  return value === undefined || value === null ? undefined : vector.read(value);
}

function readCameraView(raw: Record<string, unknown>): CameraViewInput | typeof INVALID {
  if (Object.keys(raw).some((key) => !VIEW_KEYS.includes(key))) return INVALID;
  const position = vector.read(raw.position);
  const target = optionalVector(raw.target);
  const up = optionalVector(raw.up);
  if (position === INVALID || target === INVALID || up === INVALID) return INVALID;
  return { position, ...(target ? { target } : {}), ...(up ? { up } : {}) };
}

export function cameraViewParam(description: string): ParamSpec<CameraViewInput> {
  return param.object(description, VIEW_FORMAT, readCameraView);
}

export function resolveCameraView(input: CameraViewInput, fallback: { target: Vec3; up: Vec3 }): ResolvedCameraView {
  const target = input.target ?? fallback.target;
  const up = input.up ?? fallback.up;
  const sight = Math.hypot(input.position[0] - target[0], input.position[1] - target[1], input.position[2] - target[2]);
  if (sight < MIN_LENGTH) {
    throw fail("invalid_params", "Позиция камеры совпадает с целью: направление взгляда не определено.");
  }
  if (Math.hypot(...up) < MIN_LENGTH) throw fail("invalid_params", "Вектор up не может быть нулевым.");
  return { position: input.position, target, up };
}
