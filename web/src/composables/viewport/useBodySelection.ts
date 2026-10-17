import * as THREE from "three";
import { findByBody, findByMesh, visibleMeshes } from "./types";
import type { SceneContext } from "./types";
import { visibleBodyHits } from "./clipRaycast";

export type BodyRole = "target" | "tool";

const ROLE_COLORS: Record<BodyRole, THREE.Color> = {
  target: new THREE.Color(0x4da6ff),
  tool: new THREE.Color(0xff8c42),
};

export interface BodyRoles {
  targetId: string | null;
  toolIds: string[];
}

export function useBodySelection(options: {
  context: SceneContext;
  onPicked: (bodyId: string) => void;
  onCleared: () => void;
}) {
  const { context } = options;
  let roles: BodyRoles = { targetId: null, toolIds: [] };

  function paint(bodyId: string, color: THREE.Color | null) {
    const entry = findByBody(context.entries, bodyId);
    if (!entry) return;
    const mat = entry.mesh.material as THREE.MeshStandardMaterial;
    // Подсветка грани включает vertexColors: пока он включён, material.color
    // умножается на цвет вершин и роль тела не видна.
    if (mat.vertexColors) {
      mat.vertexColors = false;
      mat.needsUpdate = true;
    }
    mat.color.copy(color ?? entry.color);
  }

  function painted(next: BodyRoles): Map<string, BodyRole> {
    const byBody = new Map<string, BodyRole>(next.toolIds.map((bodyId) => [bodyId, "tool"]));
    if (next.targetId) byBody.set(next.targetId, "target");
    return byBody;
  }

  function setRoles(next: BodyRoles) {
    const before = painted(roles);
    const after = painted(next);
    for (const bodyId of before.keys()) if (!after.has(bodyId)) paint(bodyId, null);
    for (const [bodyId, role] of after) if (before.get(bodyId) !== role) paint(bodyId, ROLE_COLORS[role]);
    roles = { targetId: next.targetId, toolIds: [...next.toolIds] };
  }

  function handleClick() {
    const meshes = visibleMeshes(context.entries);
    context.raycaster().setFromCamera(context.pointer(), context.camera());
    const hits = visibleBodyHits(context, context.raycaster().intersectObjects(meshes, false));
    const entry = hits.length > 0 ? findByMesh(context.entries, hits[0].object) : null;
    if (entry) options.onPicked(entry.bodyId);
    else options.onCleared();
  }

  function forget(bodyId: string) {
    roles = { targetId: roles.targetId === bodyId ? null : roles.targetId, toolIds: roles.toolIds.filter((id) => id !== bodyId) };
  }

  return {
    handleClick,
    setRoles,
    clear: () => setRoles({ targetId: null, toolIds: [] }),
    forget,
    getSelected: () => ({ targetId: roles.targetId, toolId: roles.toolIds[0] ?? null, toolIds: [...roles.toolIds] }),
  };
}
