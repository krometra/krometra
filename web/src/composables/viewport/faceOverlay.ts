import * as THREE from "three";
import type { MeshEntry } from "./types";

const FACE_OVERLAY = "faceOverlay";

function noRaycast() {}

function faceCorners(entry: MeshEntry, faceId: string | number): number[] {
  const source = entry.mesh.geometry;
  const positions = source.getAttribute("position");
  const index = source.index;
  const corners: number[] = [];
  entry.faceTriangleMap.forEach((owner, triangle) => {
    if (owner !== faceId) return;
    for (const corner of [0, 1, 2]) {
      const vertex = index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
      corners.push(positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex));
    }
  });
  return corners;
}

export function createFaceOverlay(entry: MeshEntry, faceId: string | number): THREE.Mesh | null {
  const corners = faceCorners(entry, faceId);
  if (corners.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners, 3));
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.52,
    metalness: 0.05,
    side: THREE.DoubleSide,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const overlay = new THREE.Mesh(geometry, material);
  overlay.raycast = noRaycast;
  overlay.receiveShadow = true;
  overlay.userData[FACE_OVERLAY] = faceId;
  return overlay;
}

export function paintFaceOverlay(overlay: THREE.Mesh, body: THREE.Mesh, color: THREE.Color) {
  const material = overlay.material as THREE.MeshStandardMaterial;
  material.color.copy(color);
  material.wireframe = (body.material as THREE.MeshStandardMaterial).wireframe;
}

export function disposeFaceOverlay(overlay: THREE.Mesh) {
  overlay.removeFromParent();
  overlay.geometry.dispose();
  (overlay.material as THREE.Material).dispose();
}

export function faceOverlayColor(body: THREE.Mesh, faceId: string | number): THREE.Color | null {
  const overlay = body.children.find((child) => child.userData[FACE_OVERLAY] === faceId) as THREE.Mesh | undefined;
  return overlay ? (overlay.material as THREE.MeshStandardMaterial).color : null;
}
