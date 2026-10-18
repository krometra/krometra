import * as THREE from "three";
import type { BrepTopo } from "@/types/api";
import type { MeshEntry, SceneContext } from "./types";
import { findByBody, findByMesh } from "./types";
import { raycastFace } from "./faceRaycast";
import { createFaceOverlay, disposeFaceOverlay, paintFaceOverlay } from "./faceOverlay";

const HIGHLIGHT_COLOR = new THREE.Color(0x4da6ff);
const HOVER_COLOR = new THREE.Color(0x7fc4ff);
const MARK_COLOR = new THREE.Color(0xff9f43);

/**
 * Выбор и подсветка граней. Подсветка рисуется накладкой поверх грани, буферы
 * самого тела не меняются. Выбранная грань запоминается отдельно: ховер её
 * перекрашивает, и её нужно вернуть, как только курсор ушёл в пустоту.
 */
export function useFaceSelection(options: {
  context: SceneContext;
  onSelected: (payload: { bodyId: string; faceId: string | number; brepTopo: BrepTopo; point: [number, number, number] }) => void;
  onCleared: () => void;
}) {
  const { context } = options;
  let activeMesh: THREE.Mesh | null = null;
  let highlightedFaceId: string | number | null = null;
  let selected: { mesh: THREE.Mesh; faceId: string | number } | null = null;
  let marked: { mesh: THREE.Mesh; faceIds: Set<string | number> } | null = null;

  const overlays = new Map<THREE.Mesh, Map<string | number, THREE.Mesh>>();

  function restingColor(mesh: THREE.Mesh, faceId: string | number): THREE.Color | null {
    return marked?.mesh === mesh && marked.faceIds.has(faceId) ? MARK_COLOR : null;
  }

  function removeOverlay(mesh: THREE.Mesh, faceId: string | number) {
    const faces = overlays.get(mesh);
    const overlay = faces?.get(faceId);
    if (!faces || !overlay) return;
    disposeFaceOverlay(overlay);
    faces.delete(faceId);
    if (faces.size === 0) overlays.delete(mesh);
  }

  function overlayFor(entry: MeshEntry, faceId: string | number): THREE.Mesh | null {
    const faces = overlays.get(entry.mesh) ?? new Map<string | number, THREE.Mesh>();
    const existing = faces.get(faceId);
    if (existing) return existing;
    const overlay = createFaceOverlay(entry, faceId);
    if (!overlay) return null;
    entry.mesh.add(overlay);
    faces.set(faceId, overlay);
    overlays.set(entry.mesh, faces);
    return overlay;
  }

  function paintMeshFace(mesh: THREE.Mesh, faceId: string | number, color: THREE.Color | null) {
    const entry = findByMesh(context.entries, mesh);
    if (!entry) return;
    const paint = color ?? restingColor(mesh, faceId);
    if (!paint) {
      removeOverlay(mesh, faceId);
      return;
    }
    const overlay = overlayFor(entry, faceId);
    if (overlay) paintFaceOverlay(overlay, mesh, paint);
  }

  function paintFace(faceId: string | number, color: THREE.Color | null) {
    if (activeMesh) paintMeshFace(activeMesh, faceId, color);
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
      point: found.point,
    });
  }

  function clearSelection() {
    selected = null;
    clearHighlight();
  }

  function clearMarkedFaces() {
    const previous = marked;
    marked = null;
    previous?.faceIds.forEach((faceId) => paintMeshFace(previous.mesh, faceId, null));
  }

  function markFaces(bodyId: string, faceIds: (string | number)[]) {
    clearMarkedFaces();
    const entry = findByBody(context.entries, bodyId);
    if (!entry) return;
    marked = { mesh: entry.mesh, faceIds: new Set(faceIds) };
    faceIds.forEach((faceId) => paintMeshFace(entry.mesh, faceId, MARK_COLOR));
  }

  /** Меш удаляется из сцены — снимаем с него ссылки, чтобы не красить мёртвую геометрию. */
  function forget(entry: MeshEntry) {
    overlays.get(entry.mesh)?.forEach((overlay) => disposeFaceOverlay(overlay));
    overlays.delete(entry.mesh);
    if (activeMesh === entry.mesh) {
      activeMesh = null;
      highlightedFaceId = null;
    }
    if (selected?.mesh === entry.mesh) selected = null;
    if (marked?.mesh === entry.mesh) marked = null;
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
    markFaces,
    clearMarkedFaces,
    restoreSelected,
    forget,
    adopt,
  };
}
