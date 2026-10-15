import * as THREE from "three";
import { fitDistance, lookAtPose, type CameraPose, type LookAtTarget } from "@/lib/lookAtView";
import { bodyFaceFrame } from "./bodyGeometry";
import type { SceneContext } from "./types";

const NEAR_FRACTION = 100;

export function useCameraLookAt(
  context: SceneContext,
  animateCameraTo: (position: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3) => void,
) {
  function keepNearPlaneAhead(distance: number) {
    const camera = context.camera();
    if (camera.near <= distance / 10) return;
    camera.near = distance / NEAR_FRACTION;
    camera.updateProjectionMatrix();
  }

  function lookAt(target: LookAtTarget): CameraPose | null {
    if (!context.ready()) return null;
    const fov = context.camera().fov;
    const pose = lookAtPose(target, fov);
    keepNearPlaneAhead(fitDistance(target.radius, fov));
    animateCameraTo(new THREE.Vector3(...pose.position), new THREE.Vector3(...pose.target), new THREE.Vector3(...pose.up));
    return pose;
  }

  function lookAtFace(bodyId: string, faceId: string | number): CameraPose | null {
    const frame = bodyFaceFrame(context.entries, bodyId, faceId);
    return frame ? lookAt(frame) : null;
  }

  return { lookAt, lookAtFace };
}
