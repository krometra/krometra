import * as THREE from "three";
import type { MeasureRef } from "@/lib/measure";
import type { Vec3 } from "@/lib/threadGeometry";
import { edgePoints } from "./edgeGeometry";
import type { MeshEntry } from "./types";

export const MEASURE_HOVER_COLOR = 0x7fc4ff;
export const MEASURE_PICK_COLORS = [0xffa640, 0x3ccf91];
const SEGMENT_COLOR = 0xff4d6d;
const POINT_SIZE_PX = 9;
const OVERLAY_ORDER = 20;

function surfaceMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function lineObject(points: THREE.Vector3[], color: number): THREE.Line {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }),
  );
  line.renderOrder = OVERLAY_ORDER;
  return line;
}

function pointsObject(points: THREE.Vector3[], color: number): THREE.Points {
  const object = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.PointsMaterial({ color, size: POINT_SIZE_PX, sizeAttenuation: false, depthTest: false, transparent: true }),
  );
  object.renderOrder = OVERLAY_ORDER + 1;
  return object;
}

function faceObject(entry: MeshEntry, faceId: string, color: number): THREE.Mesh | null {
  const source = entry.mesh.geometry;
  const positions = source.getAttribute("position");
  const index = source.index;
  const corners: number[] = [];
  entry.faceTriangleMap.forEach((owner, triangle) => {
    if (String(owner) !== faceId) return;
    for (const corner of [0, 1, 2]) {
      const vertex = index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
      corners.push(positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex));
    }
  });
  if (corners.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners, 3));
  const mesh = new THREE.Mesh(geometry, surfaceMaterial(color));
  mesh.renderOrder = OVERLAY_ORDER - 1;
  return mesh;
}

function bodyObject(entry: MeshEntry, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(entry.mesh.geometry, surfaceMaterial(color));
  mesh.userData["sharedGeometry"] = true;
  mesh.renderOrder = OVERLAY_ORDER - 1;
  return mesh;
}

function edgeObject(entry: MeshEntry, edgeId: string, color: number): THREE.Line | null {
  const edge = entry.brepTopo.edges?.find((candidate) => String(candidate.edge_id) === edgeId);
  const points = edge ? edgePoints(entry, edge) : [];
  return points.length >= 2 ? lineObject(points, color) : null;
}

export function pickObject(entry: MeshEntry, pick: MeasureRef, color: number): THREE.Object3D | null {
  if (pick.kind === "vertex") return pointsObject([new THREE.Vector3(...pick.point)], color);
  if (pick.kind === "edge") return edgeObject(entry, pick.edgeId, color);
  if (pick.kind === "face") return faceObject(entry, pick.faceId, color);
  return bodyObject(entry, color);
}

export function segmentObject(points: [Vec3, Vec3]): THREE.Group {
  const ends = points.map((point) => new THREE.Vector3(...point));
  const group = new THREE.Group();
  group.add(lineObject(ends, SEGMENT_COLOR), pointsObject(ends, SEGMENT_COLOR));
  return group;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    const drawable = object as THREE.Mesh;
    if (!drawable.material) return;
    (drawable.material as THREE.Material).dispose();
    if (!object.userData["sharedGeometry"]) drawable.geometry.dispose();
  });
}

function clearLayer(layer: THREE.Group) {
  for (const child of [...layer.children]) disposeObject(child);
  layer.clear();
}

export function createMeasureOverlay() {
  const group = new THREE.Group();
  const hover = new THREE.Group();
  const picks = new THREE.Group();
  group.name = "measure-overlay";
  group.add(picks, hover);

  function setHover(object: THREE.Object3D | null) {
    clearLayer(hover);
    if (object) hover.add(object);
  }

  function setPicks(objects: THREE.Object3D[]) {
    clearLayer(picks);
    if (objects.length > 0) picks.add(...objects);
  }

  function dispose() {
    clearLayer(hover);
    clearLayer(picks);
    group.removeFromParent();
  }

  return { group, setHover, setPicks, dispose };
}
