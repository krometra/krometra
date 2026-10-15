import * as THREE from "three";
import type { Vec3 } from "@/lib/threadGeometry";

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CameraView {
  position: Vec3;
  target: Vec3;
  up: Vec3;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  behind: boolean;
  inside: boolean;
}

export interface ThreadPreviewSnapshot {
  starts: number;
  pitch: number;
  depth: number;
  external: boolean;
  threads: number;
  bbox: { min: Vec3; max: Vec3 };
}

export function cameraForView(camera: THREE.PerspectiveCamera, view: CameraView): THREE.PerspectiveCamera {
  const probe = camera.clone(false);
  probe.position.set(...view.position);
  probe.up.set(...view.up);
  probe.lookAt(...view.target);
  probe.updateMatrixWorld(true);
  return probe;
}

export function projectToClient(camera: THREE.PerspectiveCamera, rect: CanvasRect, points: Vec3[]): ProjectedPoint[] {
  camera.updateMatrixWorld();
  return points.map((point) => {
    const world = new THREE.Vector3(...point);
    const behind = world.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0;
    const ndc = world.project(camera);
    const x = rect.left + ((ndc.x + 1) / 2) * rect.width;
    const y = rect.top + ((1 - ndc.y) / 2) * rect.height;
    const inside = !behind && x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
    return { x, y, behind, inside };
  });
}

export function visibleSceneBodyIds(scene: THREE.Object3D): string[] {
  const ids = new Set<string>();
  scene.traverse((object) => {
    const bodyId: unknown = object.userData.bodyId;
    if (object instanceof THREE.Mesh && object.visible && typeof bodyId === "string") ids.add(bodyId);
  });
  return [...ids];
}

export function threadPreviewSnapshot(scene: THREE.Object3D): ThreadPreviewSnapshot | null {
  let snapshot: ThreadPreviewSnapshot | null = null;
  scene.traverse((object) => {
    const marker = object.userData.threadPreview as Omit<ThreadPreviewSnapshot, "threads" | "bbox"> | undefined;
    if (!marker) return;
    const box = new THREE.Box3();
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      box.union(new THREE.Box3().setFromBufferAttribute(child.geometry.getAttribute("position") as THREE.BufferAttribute));
    });
    snapshot = {
      starts: marker.starts,
      pitch: marker.pitch,
      depth: marker.depth,
      external: marker.external,
      threads: object.children.length,
      bbox: { min: box.min.toArray(), max: box.max.toArray() },
    };
  });
  return snapshot;
}

export interface MirrorPreviewSnapshot {
  sourceBodyId: string;
  bbox: { min: Vec3; max: Vec3 };
}

export function mirrorPreviewSnapshot(scene: THREE.Object3D): MirrorPreviewSnapshot | null {
  let snapshot: MirrorPreviewSnapshot | null = null;
  scene.traverse((object) => {
    const marker = object.userData.mirrorPreview as { sourceBodyId: string } | undefined;
    if (!marker || !(object instanceof THREE.Mesh)) return;
    const box = new THREE.Box3().setFromBufferAttribute(object.geometry.getAttribute("position") as THREE.BufferAttribute);
    snapshot = { sourceBodyId: marker.sourceBodyId, bbox: { min: box.min.toArray(), max: box.max.toArray() } };
  });
  return snapshot;
}
