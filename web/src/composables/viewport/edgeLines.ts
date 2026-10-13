import * as THREE from "three";
import type { MeshEntry } from "./types";
import { edgePoints } from "./edgeGeometry";
import type { EdgeId } from "./edgeGroups";

export type EdgeStyle = "default" | "hover" | "selected" | "focus";

const DEFAULT_COLOR = new THREE.Color(0x5a6a8a);

// Hover/selected рисуются без depth test поверх тела: линия лежит ровно на
// поверхности меша и иначе тонет в z-fighting
const STYLES: Record<EdgeStyle, { color: THREE.Color; depthTest: boolean; renderOrder: number }> = {
  focus: { color: new THREE.Color(0xffffff), depthTest: false, renderOrder: 13 },
  selected: { color: new THREE.Color(0xffd700), depthTest: false, renderOrder: 12 },
  hover: { color: new THREE.Color(0x4da6ff), depthTest: false, renderOrder: 11 },
  default: { color: DEFAULT_COLOR, depthTest: true, renderOrder: 0 },
};

function linesById(group: THREE.Group): Map<EdgeId, THREE.Line> {
  return group.userData["lines"];
}

export function buildEdgeLines(entry: MeshEntry): THREE.Group {
  const group = new THREE.Group();
  const lines = new Map<EdgeId, THREE.Line>();
  for (const edge of entry.brepTopo.edges ?? []) {
    const points = edgePoints(entry, edge);
    if (points.length < 2) continue;

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: DEFAULT_COLOR, linewidth: 1, depthTest: true }),
    );
    line.userData["edgeId"] = edge.edge_id;
    line.userData["bodyId"] = entry.bodyId;
    lines.set(edge.edge_id, line);
    group.add(line);
  }
  group.userData["lines"] = lines;
  return group;
}

export function disposeEdgeLines(group: THREE.Group) {
  for (const line of linesById(group).values()) {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }
}

export function styleEdgeLine(group: THREE.Group, edgeId: EdgeId, style: EdgeStyle) {
  const line = linesById(group).get(edgeId);
  if (!line) return;
  const spec = STYLES[style];
  const material = line.material as THREE.LineBasicMaterial;
  material.color.copy(spec.color);
  material.depthTest = spec.depthTest;
  line.renderOrder = spec.renderOrder;
}

export function visibleEdgeLines(entries: MeshEntry[]): THREE.Line[] {
  return entries.flatMap((entry) => (entry.visible && entry.edgeLines ? [...linesById(entry.edgeLines).values()] : []));
}
