import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { SketchEntity, SketchPlane } from "@/types/api";
import type { ResolvedFrame, SketchFrame } from "./types";
import { isConstruction } from "@/sketcher/geometry";

// Базис плоскости эскиза (U, V, N): world = origin + U*u + V*v.
// Должен совпадать с backend geometry/wire_builder.py PLANE_BASES.
const PLANE_BASES: Record<SketchPlane, [THREE.Vector3, THREE.Vector3, THREE.Vector3]> = {
  XY: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
  XZ: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)],
  YZ: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)],
};

export function resolveFrame(frame: SketchFrame): ResolvedFrame {
  if (frame.basis) {
    const b = frame.basis;
    return {
      origin: new THREE.Vector3(...b.origin),
      u: new THREE.Vector3(...b.u),
      v: new THREE.Vector3(...b.v),
    };
  }
  const [u, v, n] = PLANE_BASES[frame.plane ?? "XY"] ?? PLANE_BASES.XY;
  return { origin: n.clone().multiplyScalar(frame.offset ?? 0), u, v };
}

export function frameNormal(frame: SketchFrame): THREE.Vector3 {
  if (frame.basis) return new THREE.Vector3(...frame.basis.n).normalize();
  return (PLANE_BASES[frame.plane ?? "XY"] ?? PLANE_BASES.XY)[2].clone();
}

export function sketchPointTo3D(x: number, y: number, frame: ResolvedFrame): THREE.Vector3 {
  return frame.origin.clone().addScaledVector(frame.u, x).addScaledVector(frame.v, y);
}

function sampleCircle(
  center: { x: number; y: number },
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number,
  frame: ResolvedFrame,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / segments);
    points.push(
      sketchPointTo3D(center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle), frame),
    );
  }
  return points;
}

export function entityToPoints(entity: SketchEntity, frame: ResolvedFrame): THREE.Vector3[] {
  switch (entity.type) {
    case "infline":
      return [];
    case "line":
      return [
        sketchPointTo3D(entity.start.x, entity.start.y, frame),
        sketchPointTo3D(entity.end.x, entity.end.y, frame),
      ];
    case "rectangle": {
      const { corner1, corner2 } = entity;
      const corners: [number, number][] = [
        [corner1.x, corner1.y],
        [corner2.x, corner1.y],
        [corner2.x, corner2.y],
        [corner1.x, corner2.y],
        [corner1.x, corner1.y],
      ];
      return corners.map(([x, y]) => sketchPointTo3D(x, y, frame));
    }
    case "circle":
      return sampleCircle(entity.center, entity.radius, 0, Math.PI * 2, 48, frame);
    case "arc":
      return sampleCircle(entity.center, entity.radius, entity.startAngle, entity.endAngle, 32, frame);
  }
}

export const SKETCH_OUTLINE_LIFT_MM = 0.05;

export function liftedOutlinePoints(points: THREE.Vector3[], normal: THREE.Vector3): number[] {
  return points.flatMap((point) => point.clone().addScaledVector(normal, SKETCH_OUTLINE_LIFT_MM).toArray());
}

/** Контуры сохранённых эскизов, видимые в 3D вне режима редактирования. */
export function useSketchOutlines(sketchGroup: THREE.Group) {
  const OUTLINE_COLOR = 0xd9480f;
  const OUTLINE_WIDTH_PX = 2.5;
  const groups = new Map<string, THREE.Group>();

  function add(sketchId: string, entities: SketchEntity[], sketchFrame: SketchFrame = {}) {
    remove(sketchId);

    const frame = resolveFrame(sketchFrame);
    const normal = frameNormal(sketchFrame);
    const group = new THREE.Group();
    const material = new LineMaterial({ color: OUTLINE_COLOR, linewidth: OUTLINE_WIDTH_PX });

    for (const entity of entities) {
      if (isConstruction(entity)) continue;
      const points = entityToPoints(entity, frame);
      if (points.length < 2) continue;
      const geometry = new LineGeometry();
      geometry.setPositions(liftedOutlinePoints(points, normal));
      const line = new Line2(geometry, material);
      line.computeLineDistances();
      group.add(line);
    }

    sketchGroup.add(group);
    groups.set(sketchId, group);
  }

  function remove(sketchId: string) {
    const group = groups.get(sketchId);
    if (!group) return;
    sketchGroup.remove(group);
    const materials = new Set<THREE.Material>();
    for (const child of group.children) {
      if (child instanceof Line2) {
        child.geometry.dispose();
        materials.add(child.material);
      }
    }
    materials.forEach((material) => material.dispose());
    groups.delete(sketchId);
  }

  function clearAll() {
    for (const sketchId of [...groups.keys()]) remove(sketchId);
  }

  return { add, remove, clearAll, groups: () => groups };
}
