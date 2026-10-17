import * as THREE from "three";
import { polygonIndexAt, type RegionPolygon } from "@/lib/sketchRegions";
import { visibleBodyHits } from "./clipRaycast";
import type { SceneContext, SketchFrame } from "./types";
import { visibleMeshes } from "./types";
import { frameNormal, resolveFrame } from "./useSketchOutlines";

export interface ProfileRegionView {
  frame: SketchFrame;
  regions: { key: string; polygon: RegionPolygon }[];
  selected: string[];
}

type RegionPickHandler = (key: string, additive: boolean) => void;

const REGION_COLOR = 0x4da6ff;
const HOVER_OPACITY = 0.22;
const SELECTED_OPACITY = 0.5;
const RENDER_ORDER = 5;

function regionMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: REGION_COLOR,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function frameMatrix(frame: SketchFrame): THREE.Matrix4 {
  const resolved = resolveFrame(frame);
  const matrix = new THREE.Matrix4().makeBasis(resolved.u.clone(), resolved.v.clone(), frameNormal(frame));
  return matrix.setPosition(resolved.origin);
}

function regionShape(polygon: RegionPolygon): THREE.Shape {
  const vectors = (points: { x: number; y: number }[]) => points.map((p) => new THREE.Vector2(p.x, p.y));
  const shape = new THREE.Shape(vectors(polygon.outer));
  shape.holes = polygon.holes.map((hole) => new THREE.Path(vectors(hole)));
  return shape;
}

export function useRegionPicking(context: SceneContext) {
  let view: ProfileRegionView | null = null;
  let onPick: RegionPickHandler | null = null;
  let hoveredKey: string | null = null;
  const fills = new THREE.Group();
  let hoverMesh: THREE.Mesh | null = null;

  function fillMesh(polygons: RegionPolygon[], opacity: number): THREE.Mesh {
    const geometry = new THREE.ShapeGeometry(polygons.map(regionShape));
    geometry.applyMatrix4(frameMatrix(view!.frame));
    const mesh = new THREE.Mesh(geometry, regionMaterial(opacity));
    mesh.renderOrder = RENDER_ORDER;
    return mesh;
  }

  function disposeMesh(mesh: THREE.Mesh) {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }

  function clearFills() {
    for (const child of [...fills.children]) {
      fills.remove(child);
      disposeMesh(child as THREE.Mesh);
    }
  }

  function clearHover() {
    if (hoverMesh) {
      context.scene()?.remove(hoverMesh);
      disposeMesh(hoverMesh);
      hoverMesh = null;
    }
    hoveredKey = null;
  }

  function show(next: ProfileRegionView, handler: RegionPickHandler) {
    view = next;
    onPick = handler;
    clearFills();
    clearHover();
    if (!context.ready()) return;
    if (!fills.parent) context.scene().add(fills);
    const chosen = next.regions.filter((region) => next.selected.includes(region.key)).map((region) => region.polygon);
    if (chosen.length > 0) fills.add(fillMesh(chosen, SELECTED_OPACITY));
  }

  function hide() {
    clearFills();
    clearHover();
    fills.parent?.remove(fills);
    view = null;
    onPick = null;
  }

  function hitKey(): string | null {
    if (!view || !context.ready()) return null;
    const raycaster = context.raycaster();
    raycaster.setFromCamera(context.pointer(), context.camera());
    const resolved = resolveFrame(view.frame);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(frameNormal(view.frame), resolved.origin);
    const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!point) return null;
    const planeDistance = point.distanceTo(raycaster.ray.origin);
    const bodyHits = visibleBodyHits(context, raycaster.intersectObjects(visibleMeshes(context.entries), false));
    if (bodyHits.length > 0 && bodyHits[0].distance < planeDistance - Math.max(1e-3, planeDistance * 1e-5)) return null;
    const local = point.clone().sub(resolved.origin);
    const index = polygonIndexAt(view.regions.map((region) => region.polygon), { x: local.dot(resolved.u), y: local.dot(resolved.v) });
    return index === null ? null : view.regions[index].key;
  }

  function isActive(): boolean {
    return view !== null;
  }

  function handleClick(additive: boolean): boolean {
    const key = hitKey();
    if (!key || !onPick) return false;
    onPick(key, additive);
    return true;
  }

  function handleHover(): boolean {
    const key = hitKey();
    if (key === hoveredKey) return key !== null;
    clearHover();
    const region = view?.regions.find((candidate) => candidate.key === key);
    if (!region) return false;
    hoveredKey = region.key;
    hoverMesh = fillMesh([region.polygon], HOVER_OPACITY);
    context.scene().add(hoverMesh);
    return true;
  }

  return { show, hide, isActive, handleClick, handleHover, clearHover };
}
