import * as THREE from "three";

/**
 * Единственный источник истины по ориентации сцены.
 *
 * Геометрическое ядро работает в Z-up (эскиз на XY, выдавливание вдоль +Z), и
 * сцена обязана совпадать с ним: иначе «горизонтальная» плоскость в вьюпорте
 * оказывается XZ, а экспортированная деталь лежит на боку.
 */
export const WORLD_UP = new THREE.Vector3(0, 0, 1);

/** Мировые оси в порядке X, Y, Z — для триады и отладки. */
export const AXES: { name: "X" | "Y" | "Z"; dir: THREE.Vector3; color: string }[] = [
  { name: "X", dir: new THREE.Vector3(1, 0, 0), color: "oklch(0.65 0.16 25)" },
  { name: "Y", dir: new THREE.Vector3(0, 1, 0), color: "oklch(0.74 0.13 150)" },
  { name: "Z", dir: new THREE.Vector3(0, 0, 1), color: "oklch(0.70 0.13 233)" },
];

/** Направление камеры для изометрии (нормализованное, Z-up). */
export const ISO_DIRECTION = new THREE.Vector3(1, -1, 0.85).normalize();

/** Сетка лежит в плоскости XY (THREE.GridHelper по умолчанию строится в XZ). */
export function createGrid(size = 20, divisions = 20): THREE.GridHelper {
  const grid = new THREE.GridHelper(size, divisions, 0xaab7c8, 0xd8e0e8);
  grid.rotation.x = Math.PI / 2;
  return grid;
}

/**
 * Вектор камеры в осях Y-up, как его ждёт CSS-куб ViewCube:
 * мировой +Z (верх) → CSS +Y, мировой -Y (перед) → CSS +Z.
 */
export function toCubeSpace(v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.z, -v.y);
}

export interface ProjectedAxis {
  name: "X" | "Y" | "Z";
  color: string;
  /** Смещение конца оси от центра в экранных координатах (y вниз). */
  dx: number;
  dy: number;
  /** Проекция на направление взгляда: >0 — ось уходит от зрителя. */
  depth: number;
}

/**
 * Мировые оси, спроецированные в плоскость экрана камеры.
 * Дальние идут первыми, чтобы ближние рисовались поверх них.
 */
export function projectAxes(
  eye: THREE.Vector3,
  target: THREE.Vector3,
  up: THREE.Vector3,
  length: number,
): ProjectedAxis[] {
  const forward = new THREE.Vector3().subVectors(target, eye).normalize();
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const screenUp = new THREE.Vector3().crossVectors(right, forward).normalize();

  return AXES.map(({ name, dir, color }) => ({
    name,
    color,
    dx: dir.dot(right) * length,
    dy: -dir.dot(screenUp) * length,
    depth: dir.dot(forward),
  })).sort((a, b) => b.depth - a.depth);
}
