import * as THREE from "three";
import { brepEdgeCoordinates } from "@/lib/brepEdge";
import type { BrepTopoEdge } from "@/types/api";
import type { MeshEntry } from "./types";

/**
 * Точки ребра для отрисовки и выбора.
 *
 * Сервер присылает тесселированную кривую (`polyline`): без неё круглая кромка
 * (торец цилиндра, сквозное отверстие) сводилась к своей единственной вершине,
 * линии не было и ребро нельзя было выбрать под фаску/скругление.
 */
export function edgePoints(entry: MeshEntry, edge: BrepTopoEdge): THREE.Vector3[] {
  const positions = entry.mesh.geometry.getAttribute("position").array as ArrayLike<number>;
  return brepEdgeCoordinates(positions, edge).map(([x, y, z]) => new THREE.Vector3(x, y, z));
}
