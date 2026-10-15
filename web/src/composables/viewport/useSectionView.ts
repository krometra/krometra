import * as THREE from "three";
import type { ClipPlane } from "@/lib/sectionPlane";
import type { MeshEntry, SceneContext } from "./types";

const CAP_COLOR = 0xe0874a;
const CAP_SCALE = 4;
const CAP_LIFT = 1e-5;
const STENCIL_HELPER = "sectionStencil";
const PLANE_Z = new THREE.Vector3(0, 0, 1);

function stencilMaterial(side: THREE.Side, operation: THREE.StencilOp): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    side,
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: operation,
    stencilZFail: operation,
    stencilZPass: operation,
  });
}

function capMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: CAP_COLOR,
    roughness: 0.6,
    metalness: 0.05,
    side: THREE.DoubleSide,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  });
}

function noRaycast() {}

export function useSectionView(context: SceneContext) {
  const plane = new THREE.Plane();
  const stencilMaterials = [
    stencilMaterial(THREE.BackSide, THREE.IncrementWrapStencilOp),
    stencilMaterial(THREE.FrontSide, THREE.DecrementWrapStencilOp),
  ];
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), capMaterial());
  cap.renderOrder = 2;
  cap.raycast = noRaycast;
  let active = false;

  function attach(entry: MeshEntry) {
    if (entry.mesh.children.some((child) => child.userData[STENCIL_HELPER])) return;
    for (const material of stencilMaterials) {
      const helper = new THREE.Mesh(entry.mesh.geometry, material);
      helper.renderOrder = 1;
      helper.raycast = noRaycast;
      helper.userData[STENCIL_HELPER] = true;
      entry.mesh.add(helper);
    }
  }

  function detach(entry: MeshEntry) {
    for (const helper of entry.mesh.children.filter((child) => child.userData[STENCIL_HELPER])) entry.mesh.remove(helper);
  }

  function placeCap() {
    const box = new THREE.Box3();
    for (const entry of context.entries) if (entry.visible) box.expandByObject(entry.mesh);
    cap.visible = !box.isEmpty();
    if (!cap.visible) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const size = Math.max(sphere.radius, 1) * CAP_SCALE;
    plane.projectPoint(sphere.center, cap.position).addScaledVector(plane.normal, size * CAP_LIFT);
    cap.quaternion.setFromUnitVectors(PLANE_Z, plane.normal);
    cap.scale.set(size, size, 1);
  }

  function apply(clip: ClipPlane) {
    plane.normal.set(...clip.normal);
    plane.constant = clip.constant;
    context.renderer().clippingPlanes = [plane];
    for (const entry of context.entries) attach(entry);
    if (!cap.parent) context.scene().add(cap);
    active = true;
    placeCap();
  }

  function clear() {
    if (!active) return;
    active = false;
    context.renderer().clippingPlanes = [];
    for (const entry of context.entries) detach(entry);
    cap.removeFromParent();
  }

  function adopt(entry: MeshEntry) {
    if (!active) return;
    attach(entry);
    placeCap();
  }

  function unclipped<T>(render: () => T): T {
    const renderer = context.renderer();
    const planes = renderer.clippingPlanes;
    renderer.clippingPlanes = [];
    try {
      return render();
    } finally {
      renderer.clippingPlanes = planes;
    }
  }

  function snapshot(): ClipPlane | null {
    return active ? { normal: plane.normal.toArray(), constant: plane.constant } : null;
  }

  function dispose() {
    clear();
    for (const material of stencilMaterials) material.dispose();
    cap.geometry.dispose();
    (cap.material as THREE.Material).dispose();
  }

  return { apply, clear, adopt, unclipped, snapshot, dispose };
}
