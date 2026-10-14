import * as THREE from "three";
import type { BrepTopo } from "@/types/api";
import type { MeshEntry, SceneContext } from "./types";
import { findByMesh } from "./types";
import { raycastFace } from "./faceRaycast";

const HIGHLIGHT_COLOR = new THREE.Color(0x4da6ff);
const HOVER_COLOR = new THREE.Color(0x7fc4ff);

/**
 * Выбор и подсветка граней. Подсветка идёт по вершинным цветам меша, поэтому
 * выбранная грань запоминается отдельно: ховер её перекрашивает, и её нужно
 * вернуть, как только курсор ушёл в пустоту.
 */
export function useFaceSelection(options: {
  context: SceneContext;
  onSelected: (payload: { bodyId: string; faceId: string | number; brepTopo: BrepTopo }) => void;
  onCleared: () => void;
}) {
  const { context } = options;
  let activeMesh: THREE.Mesh | null = null;
  let highlightedFaceId: string | number | null = null;
  let selected: { mesh: THREE.Mesh; faceId: string | number } | null = null;

  /** Перекрасить треугольники грани в буфере вершинных цветов. */
  function paintFace(faceId: string | number, color: THREE.Color | null) {
    if (!activeMesh) return;
    const entry = findByMesh(context.entries, activeMesh);
    if (!entry) return;

    const geo = activeMesh.geometry;
    if (!geo.getAttribute("color")) {
      const count = geo.getAttribute("position").count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = entry.color.r;
        colors[i * 3 + 1] = entry.color.g;
        colors[i * 3 + 2] = entry.color.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }

    // Итоговый цвет = material.color × vertex color, поэтому при включении
    // vertex colors материал должен стать белым; переключение vertexColors
    // требует пересборки шейдера (needsUpdate)
    const mat = activeMesh.material as THREE.MeshStandardMaterial;
    if (!mat.vertexColors) {
      mat.vertexColors = true;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    }

    const paint = color ?? entry.color;
    const index = geo.index!;
    const colors = geo.getAttribute("color").array as Float32Array;
    for (let t = 0; t < entry.faceTriangleMap.length; t++) {
      if (entry.faceTriangleMap[t] !== faceId) continue;
      for (const corner of [0, 1, 2]) {
        const vi = index.getX(t * 3 + corner);
        colors[vi * 3] = paint.r;
        colors[vi * 3 + 1] = paint.g;
        colors[vi * 3 + 2] = paint.b;
      }
    }
    geo.getAttribute("color").needsUpdate = true;
  }

  function highlightFace(faceId: string | number, color: THREE.Color = HIGHLIGHT_COLOR) {
    if (highlightedFaceId !== null && highlightedFaceId !== faceId) {
      paintFace(highlightedFaceId, null);
    }
    paintFace(faceId, color);
    highlightedFaceId = faceId;
  }

  function clearHighlight() {
    if (highlightedFaceId === null) return;
    paintFace(highlightedFaceId, null);
    highlightedFaceId = null;
  }

  function isSelected(mesh: THREE.Mesh, faceId: string | number): boolean {
    return selected !== null && selected.mesh === mesh && selected.faceId === faceId;
  }

  function restoreSelected() {
    clearHighlight();
    if (!selected) return;
    activeMesh = selected.mesh;
    highlightFace(selected.faceId, HIGHLIGHT_COLOR);
  }

  function setActiveMesh(mesh: THREE.Mesh | null) {
    if (activeMesh === mesh) return;
    clearHighlight();
    activeMesh = mesh;
  }

  /** Ховер: возвращает true, если под курсором есть грань. */
  function handleHover(): boolean {
    const found = raycastFace(context);
    if (!found) {
      restoreSelected();
      return false;
    }
    setActiveMesh(found.entry.mesh);
    if (highlightedFaceId !== found.faceId) {
      highlightFace(found.faceId, isSelected(found.entry.mesh, found.faceId) ? HIGHLIGHT_COLOR : HOVER_COLOR);
    }
    return true;
  }

  function handleClick() {
    const found = raycastFace(context);
    if (!found) {
      clearSelection();
      options.onCleared();
      return;
    }
    setActiveMesh(found.entry.mesh);
    selected = { mesh: found.entry.mesh, faceId: found.faceId };
    highlightFace(found.faceId, HIGHLIGHT_COLOR);
    options.onSelected({
      bodyId: found.entry.bodyId,
      faceId: found.faceId,
      brepTopo: found.entry.brepTopo,
    });
  }

  function clearSelection() {
    selected = null;
    clearHighlight();
  }

  /** Меш удаляется из сцены — снимаем с него ссылки, чтобы не красить мёртвую геометрию. */
  function forget(entry: MeshEntry) {
    if (activeMesh === entry.mesh) {
      activeMesh = null;
      highlightedFaceId = null;
    }
    if (selected?.mesh === entry.mesh) selected = null;
  }

  function adopt(entry: MeshEntry) {
    if (entry.visible) activeMesh = entry.mesh;
    highlightedFaceId = null;
  }

  return {
    handleClick,
    handleHover,
    highlightFace,
    clearHighlight,
    clearSelection,
    restoreSelected,
    forget,
    adopt,
  };
}
