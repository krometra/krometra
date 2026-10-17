import type { DraftNeutral } from "@/lib/browserDraft";
import { isMirrorBasePlane } from "@/lib/mirrorPlane";
import { INVALID } from "./params";

export const DRAFT_NEUTRAL_EXPECTED = "объект { plane: XY | XZ | YZ } или { faceId: id плоской грани }";

export function readDraftNeutral(value: Record<string, unknown>): DraftNeutral | typeof INVALID {
  const keys = Object.keys(value);
  if (keys.length !== 1) return INVALID;
  if (isMirrorBasePlane(value.plane)) return { kind: "base", plane: value.plane };
  const faceId = value.faceId;
  if (typeof faceId === "string" && faceId.length > 0) return { kind: "face", faceId };
  if (typeof faceId === "number" && Number.isFinite(faceId)) return { kind: "face", faceId: String(faceId) };
  return INVALID;
}
