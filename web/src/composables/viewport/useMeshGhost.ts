import * as THREE from "three";
import type { MeshData } from "@/types/api";
import type { SceneContext } from "./types";
import { disposeObject, PREVIEW_COLOR, previewMaterial } from "./usePreviews";

export function useMeshGhost(context: SceneContext) {
  let ghost: THREE.Mesh | null = null;

  function hide() {
    if (!ghost) return;
    context.scene()?.remove(ghost);
    disposeObject(ghost);
    ghost = null;
  }

  function show(mesh: Pick<MeshData, "vertices" | "indices">) {
    hide();
    if (!context.ready()) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(mesh.vertices), 3));
    geometry.setIndex(mesh.indices);
    geometry.computeVertexNormals();
    ghost = new THREE.Mesh(geometry, previewMaterial(PREVIEW_COLOR));
    ghost.userData.meshGhost = true;
    context.scene().add(ghost);
  }

  return { show, hide };
}
