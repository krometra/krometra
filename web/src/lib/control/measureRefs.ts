import type { MeasureRef } from "@/lib/measure";
import { INVALID, param, type ParamSpec } from "./params";

const KEYS = new Set(["bodyId", "faceId", "edgeId", "point"]);

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

function pointOf(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  return value.every((entry) => typeof entry === "number" && Number.isFinite(entry)) ? [value[0], value[1], value[2]] : null;
}

export function readMeasureRef(value: Record<string, unknown>): MeasureRef | typeof INVALID {
  const bodyId = idOf(value["bodyId"]);
  const named = ["faceId", "edgeId", "point"].filter((key) => value[key] !== undefined);
  if (!bodyId || named.length > 1 || Object.keys(value).some((key) => !KEYS.has(key))) return INVALID;
  if (named.length === 0) return { kind: "body", bodyId };
  if (named[0] === "point") {
    const point = pointOf(value["point"]);
    return point ? { kind: "vertex", bodyId, point } : INVALID;
  }
  const id = idOf(value[named[0]]);
  if (!id) return INVALID;
  return named[0] === "faceId" ? { kind: "face", bodyId, faceId: id } : { kind: "edge", bodyId, edgeId: id };
}

export function measureTarget(description: string): ParamSpec<MeasureRef> {
  return param.object(description, "объект { bodyId } и не больше одного из faceId, edgeId, point: [x, y, z]", readMeasureRef);
}
