import * as THREE from "three";
import { planeHelperWins } from "@/lib/pickPriority";
import type { WorkPlaneFrame } from "@/lib/workPlane";
import { workPlaneQuad } from "@/lib/workPlaneQuad";
import { visibleBounds } from "./bodyGeometry";
import { unclippedHits, visibleBodyHits } from "./clipRaycast";
import { visibleMeshes, type SceneContext } from "./types";
import { disposeObject } from "./usePreviews";

export interface WorkPlaneView {
  id: string;
  frame: WorkPlaneFrame;
}

const PLANE_COLOR = 0xd9a441;
const PREVIEW_COLOR = 0x4a9eda;
const IDLE_OPACITY = 0.1;
const HOVER_OPACITY = 0.3;
const PREVIEW_OPACITY = 0.22;

function quadMesh(frame: WorkPlaneFrame, color: number, opacity: number, bounds: ReturnType<typeof visibleBounds>): THREE.Mesh {
  const quad = workPlaneQuad(frame, bounds);
  const geometry = new THREE.BufferGeometry();
  const [a, b, c, d] = quad.corners;
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
  );
  const outline = new THREE.BufferGeometry().setFromPoints([a, b, c, d, a].map((point) => new THREE.Vector3(...point)));
  mesh.add(new THREE.Line(outline, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 })));
  return mesh;
}

export function useWorkPlaneView(context: SceneContext) {
  const group = new THREE.Group();
  let preview: THREE.Mesh | null = null;
  let hovered: THREE.Mesh | null = null;

  function clearPlanes() {
    hovered = null;
    for (const child of [...group.children]) {
      group.remove(child);
      disposeObject(child);
    }
  }

  function setPlanes(planes: WorkPlaneView[]) {
    clearPlanes();
    const bounds = visibleBounds(context.entries);
    for (const plane of planes) {
      const mesh = quadMesh(plane.frame, PLANE_COLOR, IDLE_OPACITY, bounds);
      mesh.userData.workPlaneId = plane.id;
      group.add(mesh);
    }
  }

  function hidePreview() {
    if (!preview) return;
    context.scene()?.remove(preview);
    disposeObject(preview);
    preview = null;
  }

  function showPreview(frame: WorkPlaneFrame) {
    hidePreview();
    if (!context.ready()) return;
    preview = quadMesh(frame, PREVIEW_COLOR, PREVIEW_OPACITY, visibleBounds(context.entries));
    preview.userData.workPlanePreview = { origin: frame.origin, normal: frame.n };
    context.scene().add(preview);
  }

  function pickMesh(): THREE.Mesh | null {
    if (group.children.length === 0) return null;
    const raycaster = context.raycaster();
    raycaster.setFromCamera(context.pointer(), context.camera());
    const bodyHits = visibleBodyHits(context, raycaster.intersectObjects(visibleMeshes(context.entries), false));
    const planeHits = unclippedHits(context, raycaster.intersectObjects(group.children, false));
    const bodyDistance = bodyHits.length > 0 ? bodyHits[0].distance : null;
    return planeHits.length > 0 && planeHelperWins(planeHits[0].distance, bodyDistance) ? (planeHits[0].object as THREE.Mesh) : null;
  }

  function setHovered(mesh: THREE.Mesh | null) {
    if (mesh === hovered) return;
    if (hovered) (hovered.material as THREE.MeshBasicMaterial).opacity = IDLE_OPACITY;
    if (mesh) (mesh.material as THREE.MeshBasicMaterial).opacity = HOVER_OPACITY;
    hovered = mesh;
  }

  function hover(): boolean {
    const mesh = pickMesh();
    setHovered(mesh);
    return mesh !== null;
  }

  function pick(): string | null {
    return (pickMesh()?.userData.workPlaneId as string | undefined) ?? null;
  }

  function planeIds(): string[] {
    return group.children.map((child) => child.userData.workPlaneId as string);
  }

  function previewSnapshot() {
    return (preview?.userData.workPlanePreview as { origin: number[]; normal: number[] } | undefined) ?? null;
  }

  function dispose() {
    clearPlanes();
    hidePreview();
  }

  return { group, setPlanes, showPreview, hidePreview, hover, clearHover: () => setHovered(null), pick, planeIds, previewSnapshot, dispose };
}
