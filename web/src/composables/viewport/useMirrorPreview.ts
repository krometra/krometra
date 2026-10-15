import * as THREE from "three";
import { reflectionMatrix, type MirrorFrame } from "@/lib/mirrorPlane";
import { findByBody, type SceneContext } from "./types";
import { disposeObject, PREVIEW_COLOR, previewMaterial } from "./usePreviews";

export function useMirrorPreview(context: SceneContext) {
  let ghost: THREE.Mesh | null = null;

  function hide() {
    if (!ghost) return;
    context.scene()?.remove(ghost);
    disposeObject(ghost);
    ghost = null;
  }

  function show(bodyId: string, frame: MirrorFrame) {
    hide();
    const entry = context.ready() ? findByBody(context.entries, bodyId) : undefined;
    if (!entry) return;
    const geometry = entry.mesh.geometry.clone();
    entry.mesh.updateWorldMatrix(true, false);
    geometry.applyMatrix4(new THREE.Matrix4().set(...(reflectionMatrix(frame) as Parameters<THREE.Matrix4["set"]>)));
    geometry.applyMatrix4(entry.mesh.matrixWorld);
    geometry.computeVertexNormals();
    ghost = new THREE.Mesh(geometry, previewMaterial(PREVIEW_COLOR));
    ghost.userData.mirrorPreview = { sourceBodyId: bodyId };
    context.scene().add(ghost);
  }

  return { show, hide };
}
