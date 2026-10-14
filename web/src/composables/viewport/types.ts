import type * as THREE from "three";
import type { BrepTopo, SketchPlane, PlaneBasis } from "@/types/api";

export type RenderingMode = "shaded" | "shaded_edges" | "wireframe" | "hidden_line";

export type SelectionMode = "face" | "body" | "edge" | "none";

/** Тело сцены: меш + его топология и производные объекты (линии рёбер). */
export interface MeshEntry {
  bodyId: string;
  mesh: THREE.Mesh;
  faceTriangleMap: (string | number)[];
  brepTopo: BrepTopo;
  visible: boolean;
  color: THREE.Color;
  edgeLines?: THREE.Group;
}

/** Плоскость эскиза: либо базовая со смещением, либо базис грани с сервера. */
export interface SketchFrame {
  plane?: SketchPlane;
  offset?: number;
  basis?: PlaneBasis | null;
}

export interface ResolvedFrame {
  origin: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
}

/**
 * Живые объекты сцены. Раздаётся composables вьюпорта вместо десятка
 * параметров: renderer/scene/camera создаются в onMounted, поэтому доступ
 * идёт через геттеры, а не по значению.
 */
export interface SceneContext {
  renderer: () => THREE.WebGLRenderer;
  scene: () => THREE.Scene;
  camera: () => THREE.PerspectiveCamera;
  controls: () => { target: THREE.Vector3; update: () => void };
  raycaster: () => THREE.Raycaster;
  /** Курсор в NDC — обновляется обработчиками мыши контейнера. */
  pointer: () => THREE.Vector2;
  meshGroup: THREE.Group;
  entries: MeshEntry[];
  ready: () => boolean;
}

export function visibleMeshes(entries: MeshEntry[]): THREE.Mesh[] {
  return entries.filter((e) => e.visible).map((e) => e.mesh);
}

export function findByMesh(entries: MeshEntry[], mesh: THREE.Object3D): MeshEntry | undefined {
  return entries.find((e) => e.mesh === mesh);
}

export function findByBody(entries: MeshEntry[], bodyId: string): MeshEntry | undefined {
  return entries.find((e) => e.bodyId === bodyId);
}
