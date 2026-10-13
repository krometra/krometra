import { ref } from "vue";
import type { BrowserExtrudeOperation } from "@/lib/browserBoolean";
import type { BrowserExtentType, BrowserExtrudeDirection, BrowserExtrudeSpan } from "@/lib/browserExtrudeExtent";
import { browserExtentMeshPoints, browserSpanFromPoints, type BrowserExtentTargets } from "@/lib/browserExtentTarget";
import type { MeshData, PlaneBasis, SketchPlane } from "@/types/api";
import type { BrowserExtrudeOptions } from "./useBrowserGeometry";
import type { BodyMeshesApi } from "./useBodyMeshes";

export interface ExtrudeBase {
  distance: number;
  direction: BrowserExtrudeDirection;
  operation: BrowserExtrudeOperation;
  targetBodyId: string | null;
}

type Placement = { plane: SketchPlane; planeOffset: number; planeBasis: PlaneBasis | null };

export interface ExtrudeExtentSettings {
  extentType?: BrowserExtentType;
  backDistance?: number;
  offset?: number;
  upToBodyId?: string | null;
  upToFace?: { bodyId: string; faceId: string | number } | null;
}

export function useExtrudeExtent(meshes: BodyMeshesApi) {
  const extentType = ref<BrowserExtentType>("distance");
  const backDistance = ref(10);
  const offset = ref(0);
  const upToBodyId = ref<string | null>(null);
  const upToFace = ref<{ bodyId: string; faceId: string | number } | null>(null);

  function meshOf(bodyId: string | null): MeshData | undefined {
    return meshes.meshBodies.value.find((body) => body.body_id === bodyId)?.mesh;
  }

  function targets(targetBodyId: string | null): BrowserExtentTargets {
    return { targetBodyId, upToBodyId: upToBodyId.value, upToFace: upToFace.value };
  }

  function pickFace(payload: { bodyId: string; faceId: string | number }): boolean {
    if (extentType.value !== "up_to_face") return false;
    upToFace.value = { bodyId: payload.bodyId, faceId: payload.faceId };
    return true;
  }

  function reset() {
    extentType.value = "distance";
    backDistance.value = 10;
    offset.value = 0;
    upToBodyId.value = null;
    upToFace.value = null;
  }

  function configure(settings: ExtrudeExtentSettings) {
    if (settings.extentType !== undefined) extentType.value = settings.extentType;
    if (settings.backDistance !== undefined) backDistance.value = settings.backDistance;
    if (settings.offset !== undefined) offset.value = settings.offset;
    if (settings.upToBodyId !== undefined) upToBodyId.value = settings.upToBodyId;
    if (settings.upToFace !== undefined) upToFace.value = settings.upToFace;
  }

  function extentOf(base: ExtrudeBase) {
    return { ...base, extentType: extentType.value, backDistance: backDistance.value, offset: offset.value };
  }

  function options(base: ExtrudeBase): BrowserExtrudeOptions {
    const face = extentType.value === "up_to_face" ? upToFace.value : null;
    return {
      ...extentOf(base),
      upToBodyId: extentType.value === "up_to_body" ? upToBodyId.value : face?.bodyId ?? null,
      upToFaceId: face?.faceId ?? null,
      upToFacePoints: face ? browserExtentMeshPoints("up_to_face", targets(base.targetBodyId), meshOf) : null,
    };
  }

  function previewSpan(placement: Placement, base: ExtrudeBase): { span: BrowserExtrudeSpan | null; error: string | null } {
    const points = browserExtentMeshPoints(extentType.value, targets(base.targetBodyId), meshOf);
    if (extentType.value !== "distance" && !points) return { span: null, error: null };
    try {
      return { span: browserSpanFromPoints(placement, extentOf(base), points), error: null };
    } catch (error) {
      return { span: null, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return { extentType, backDistance, offset, upToBodyId, upToFace, pickFace, reset, configure, options, previewSpan };
}

export type ExtrudeExtentApi = ReturnType<typeof useExtrudeExtent>;
