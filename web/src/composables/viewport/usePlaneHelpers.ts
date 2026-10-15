import * as THREE from "three";
import type { SketchPlane } from "@/types/api";
import type { SceneContext } from "./types";
import { visibleMeshes } from "./types";
import { unclippedHits, visibleBodyHits } from "./clipRaycast";
import { planeHelperWins } from "@/lib/pickPriority";

const COLORS: Record<SketchPlane, number> = {
  XY: 0x4a9eda,
  XZ: 0x53b478,
  YZ: 0xd06a5a,
};

const IDLE_OPACITY = 0.12;
const HOVER_OPACITY = 0.35;

/** Кликабельные квадраты XY/XZ/YZ в начале координат — старт эскиза. */
export function usePlaneHelpers(context: SceneContext) {
  const group = new THREE.Group();
  group.visible = false;
  let hovered: THREE.Mesh | null = null;

  function build(size: number) {
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      group.remove(child);
      child.geometry?.dispose();
      (child.material as THREE.Material)?.dispose();
    }

    const configs: { plane: SketchPlane; rotate: (g: THREE.PlaneGeometry) => void }[] = [
      { plane: "XY", rotate: () => {} },
      { plane: "XZ", rotate: (g) => g.rotateX(Math.PI / 2) },
      { plane: "YZ", rotate: (g) => g.rotateY(Math.PI / 2) },
    ];

    for (const { plane, rotate } of configs) {
      const geometry = new THREE.PlaneGeometry(size, size);
      rotate(geometry);
      const quad = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: COLORS[plane],
          transparent: true,
          opacity: IDLE_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      quad.userData["plane"] = plane;
      quad.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: COLORS[plane], transparent: true, opacity: 0.6 }),
        ),
      );
      group.add(quad);
    }
  }

  function show() {
    const box = new THREE.Box3();
    for (const entry of context.entries.filter((e) => e.visible)) box.expandByObject(entry.mesh);
    let size = 12;
    if (!box.isEmpty()) {
      const dims = new THREE.Vector3();
      box.getSize(dims);
      size = Math.max(12, Math.max(dims.x, dims.y, dims.z) * 1.4);
    }
    build(size);
    group.visible = true;
  }

  function hide() {
    group.visible = false;
    setHovered(null);
  }

  function setHovered(quad: THREE.Mesh | null) {
    if (quad === hovered) return;
    if (hovered) (hovered.material as THREE.MeshBasicMaterial).opacity = IDLE_OPACITY;
    if (quad) (quad.material as THREE.MeshBasicMaterial).opacity = HOVER_OPACITY;
    hovered = quad;
  }

  /**
   * Хелпер под курсором с учётом приоритета тел: квадраты `max(габарит)×1.4`
   * накрывают деталь целиком, а XZ/YZ проходят сквозь неё (см. lib/pickPriority).
   */
  function pick(): THREE.Mesh | null {
    if (!group.visible) return null;
    const raycaster = context.raycaster();
    raycaster.setFromCamera(context.pointer(), context.camera());
    const meshHits = visibleBodyHits(context, raycaster.intersectObjects(visibleMeshes(context.entries), false));
    const planeHits = unclippedHits(context, raycaster.intersectObjects(group.children, false));
    const meshDist = meshHits.length > 0 ? meshHits[0].distance : Infinity;
    if (planeHits.length > 0 && planeHelperWins(planeHits[0].distance, meshDist)) {
      return planeHits[0].object as THREE.Mesh;
    }
    return null;
  }

  function planeOf(quad: THREE.Mesh): SketchPlane {
    return quad.userData["plane"] as SketchPlane;
  }

  return { group, show, hide, pick, planeOf, setHovered, isVisible: () => group.visible };
}
