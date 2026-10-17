import * as THREE from "three";
import type { PressPullGhost } from "@/lib/pressPullPreview";
import type { SceneContext } from "./types";
import { disposeObject, previewMaterial } from "./usePreviews";

const GROW_COLOR = 0x4dc27a;
const SHRINK_COLOR = 0xe06c5a;

export function usePressPullPreview(context: SceneContext) {
  let group: THREE.Group | null = null;

  function hide() {
    if (!group) return;
    context.scene()?.remove(group);
    group.children.forEach((child) => {
      if (child instanceof THREE.ArrowHelper) child.dispose();
    });
    disposeObject(group);
    group = null;
  }

  function show(ghost: PressPullGhost, grows: boolean) {
    hide();
    if (!context.ready() || ghost.arrows.length === 0) return;
    const color = grows ? GROW_COLOR : SHRINK_COLOR;
    const next = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(ghost.positions, 3));
    geometry.computeVertexNormals();
    next.add(new THREE.Mesh(geometry, previewMaterial(color)));
    for (const arrow of ghost.arrows) {
      const helper = new THREE.ArrowHelper(new THREE.Vector3(...arrow.direction), new THREE.Vector3(...arrow.origin), arrow.length, color);
      helper.renderOrder = 10;
      next.add(helper);
    }
    next.userData.pressPullPreview = { faces: ghost.arrows.length, grows };
    context.scene().add(next);
    group = next;
  }

  return { show, hide };
}
