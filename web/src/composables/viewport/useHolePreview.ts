import * as THREE from "three";
import type { HolePreview } from "@/lib/holeGeometry";
import type { SceneContext } from "./types";

const HOLE_COLOR = 0xffa640;
const LATHE_SEGMENTS = 48;
const UP = new THREE.Vector3(0, 1, 0);

function holeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: HOLE_COLOR,
    transparent: true,
    opacity: 0.45,
    depthTest: false,
    depthWrite: false,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
}

function holeMesh(hole: HolePreview, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.LatheGeometry(hole.points.map(([radius, along]) => new THREE.Vector2(radius, along)), LATHE_SEGMENTS);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.quaternion.setFromUnitVectors(UP, new THREE.Vector3(...hole.axis).normalize());
  mesh.position.set(...hole.center);
  mesh.renderOrder = 10;
  return mesh;
}

export function useHolePreview(context: SceneContext) {
  let group: THREE.Group | null = null;

  function hideHoles() {
    if (!group) return;
    context.scene()?.remove(group);
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
    (group.userData.material as THREE.Material).dispose();
    group = null;
  }

  function showHoles(holes: HolePreview[]) {
    hideHoles();
    if (!context.ready() || holes.length === 0) return;
    const material = holeMaterial();
    const next = new THREE.Group();
    holes.forEach((hole) => next.add(holeMesh(hole, material)));
    next.userData = { material, holePreview: { count: holes.length } };
    context.scene().add(next);
    group = next;
  }

  return { showHoles, hideHoles };
}
