// ViewCube logic: canonical views, hit-test mappings, camera animation.
// Сцена — Z-up (см. lib/orientation.ts): «перед» смотрит с -Y, «верх» с +Z.

import * as THREE from "three";
import { ISO_DIRECTION, WORLD_UP } from "@/lib/orientation";

/** Canonical view directions (normalized camera position vectors) */
export interface CanonicalView {
  name: string;
  label: string;
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
}

const dist = 15;
const ORIGIN = new THREE.Vector3(0, 0, 0);

function view(name: string, label: string, dir: THREE.Vector3, up: THREE.Vector3): CanonicalView {
  return {
    name,
    label,
    position: dir.clone().normalize().multiplyScalar(dist),
    target: ORIGIN.clone(),
    up: up.clone(),
  };
}

const FORWARD_UP = WORLD_UP;

export const CANONICAL_VIEWS: Record<string, CanonicalView> = {
  top: view("top", "ВЕРХ", new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)),
  bottom: view("bottom", "НИЗ", new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0)),
  front: view("front", "СПЕРЕДИ", new THREE.Vector3(0, -1, 0), FORWARD_UP),
  back: view("back", "СЗАДИ", new THREE.Vector3(0, 1, 0), FORWARD_UP),
  left: view("left", "СЛЕВА", new THREE.Vector3(-1, 0, 0), FORWARD_UP),
  right: view("right", "СПРАВА", new THREE.Vector3(1, 0, 0), FORWARD_UP),
};

/** Default isometric view */
export const ISO_VIEW: CanonicalView = view("iso", "ИЗОМЕТРИЯ", ISO_DIRECTION, WORLD_UP);

/** Easing function: easeInOutCubic */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Duration of camera transition in ms */
export const TRANSITION_DURATION = 400;
