import * as THREE from "three";
import type { MeshEntry } from "./types";
import { findByBody, findByMesh, visibleMeshes } from "./types";
import { DEFAULT_BODY_COLOR } from "./useBodyRegistry";
import type { SceneContext } from "./types";

/** Роль тела в булевой операции. Слоты симметричны — код у них общий. */
export type BodyRole = "target" | "tool";

const ROLE_COLORS: Record<BodyRole, THREE.Color> = {
  target: new THREE.Color(0x4da6ff),
  tool: new THREE.Color(0xff8c42),
};

const ROLES: BodyRole[] = ["target", "tool"];

/**
 * Выбор тел для булевых операций: два слота (цель и инструмент).
 *
 * Раньше здесь жили зеркальные `selectBodyAsTarget`/`selectBodyAsTool` и
 * `setBodyColor`/`resetBodyColor` — четыре почти одинаковые функции, которые
 * расходились при правках. Теперь роль это параметр.
 */
export function useBodySelection(options: {
  context: SceneContext;
  onSelected: (bodyId: string) => void;
  onDeselected: (bodyId: string) => void;
  onCleared: () => void;
}) {
  const { context } = options;
  const slots: Record<BodyRole, string | null> = { target: null, tool: null };

  function paint(bodyId: string, color: THREE.Color) {
    const entry = findByBody(context.entries, bodyId);
    if (!entry) return;
    const mat = entry.mesh.material as THREE.MeshStandardMaterial;
    // Подсветка грани включает vertexColors: пока он включён, material.color
    // умножается на цвет вершин и роль тела не видна.
    if (mat.vertexColors) {
      mat.vertexColors = false;
      mat.needsUpdate = true;
    }
    mat.color.copy(color);
  }

  function roleOf(bodyId: string): BodyRole | null {
    return ROLES.find((role) => slots[role] === bodyId) ?? null;
  }

  function release(role: BodyRole) {
    const bodyId = slots[role];
    if (!bodyId) return;
    paint(bodyId, DEFAULT_BODY_COLOR);
    slots[role] = null;
    options.onDeselected(bodyId);
  }

  function assign(role: BodyRole, bodyId: string) {
    const previous = roleOf(bodyId);
    if (previous === role) return;
    if (previous) release(previous);
    release(role);
    slots[role] = bodyId;
    paint(bodyId, ROLE_COLORS[role]);
    options.onSelected(bodyId);
  }

  /** Клик по телу: первый занимает свободный слот, повторный освобождает свой. */
  function toggle(entry: MeshEntry) {
    const role = roleOf(entry.bodyId);
    if (role) {
      release(role);
      return;
    }
    const free = ROLES.find((r) => slots[r] === null);
    if (free) assign(free, entry.bodyId);
  }

  function handleClick() {
    const meshes = visibleMeshes(context.entries);
    context.raycaster().setFromCamera(context.pointer(), context.camera());
    const hits = context.raycaster().intersectObjects(meshes, false);

    if (hits.length === 0) {
      clear();
      options.onCleared();
      return;
    }
    const entry = findByMesh(context.entries, hits[0].object);
    if (entry) toggle(entry);
  }

  function clear() {
    for (const role of ROLES) release(role);
  }

  /** Тело удалено из сцены — слот освобождается без перекраски мёртвого меша. */
  function forget(bodyId: string) {
    const role = roleOf(bodyId);
    if (role) slots[role] = null;
  }

  return {
    handleClick,
    clear,
    forget,
    selectAsTarget: (bodyId: string) => assign("target", bodyId),
    selectAsTool: (bodyId: string) => assign("tool", bodyId),
    getSelected: () => ({ targetId: slots.target, toolId: slots.tool }),
  };
}
