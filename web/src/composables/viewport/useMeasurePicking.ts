import * as THREE from "three";
import type { BrepTopo } from "@/types/api";
import type { MeasureFilter, MeasureRef } from "@/lib/measure";
import {
  edgeCandidates,
  firstVisible,
  samePick,
  vertexCandidates,
  VERTEX_PICK_RADIUS_PX,
  type EdgeTrace,
  type ScreenPoint,
} from "@/lib/measurePick";
import type { Vec3 } from "@/lib/threadGeometry";
import { edgePoints } from "./edgeGeometry";
import { EDGE_PICK_RADIUS_PX, worldPerPixel } from "./edgePicking";
import { raycastFace } from "./faceRaycast";
import { createMeasureOverlay, MEASURE_HOVER_COLOR, MEASURE_PICK_COLORS, pickObject, segmentObject } from "./measureOverlay";
import { findByBody, visibleMeshes, type MeshEntry, type SceneContext } from "./types";

const OCCLUSION_SLACK_PX = 3;

interface WorldTrace {
  edgeId: string;
  points: Vec3[];
}

export function useMeasurePicking(options: { context: SceneContext; onPicked: (pick: MeasureRef | null) => void }) {
  const { context } = options;
  const overlay = createMeasureOverlay();
  const worldTraces = new WeakMap<BrepTopo, WorldTrace[]>();
  const projector = new THREE.Vector3();
  let filter: MeasureFilter = "entity";
  let hovered: MeasureRef | null = null;
  let picks: MeasureRef[] = [];
  let segment: [Vec3, Vec3] | null = null;

  function attach() {
    if (!overlay.group.parent && context.ready()) context.scene().add(overlay.group);
  }

  function tracesOf(entry: MeshEntry): WorldTrace[] {
    const cached = worldTraces.get(entry.brepTopo);
    if (cached) return cached;
    const traces = (entry.brepTopo.edges ?? []).map((edge) => ({
      edgeId: String(edge.edge_id),
      points: edgePoints(entry, edge).map((point) => [point.x, point.y, point.z] as Vec3),
    }));
    worldTraces.set(entry.brepTopo, traces);
    return traces;
  }

  function canvasSize(): [number, number] {
    const canvas = context.renderer().domElement;
    return [canvas.clientWidth, canvas.clientHeight];
  }

  function toScreen(world: Vec3, [width, height]: [number, number]): ScreenPoint | null {
    projector.set(world[0], world[1], world[2]).project(context.camera());
    if (projector.z < -1 || projector.z > 1) return null;
    return [((projector.x + 1) / 2) * width, ((1 - projector.y) / 2) * height];
  }

  function projectedTraces(size: [number, number]): EdgeTrace[] {
    return context.entries
      .filter((entry) => entry.visible)
      .flatMap((entry) => tracesOf(entry).map((trace) => ({
        bodyId: entry.bodyId,
        edgeId: trace.edgeId,
        points: trace.points.map((world) => ({ world, screen: toScreen(world, size) })),
      })));
  }

  function cursorOnScreen([width, height]: [number, number]): ScreenPoint {
    const pointer = context.pointer();
    return [((pointer.x + 1) / 2) * width, ((1 - pointer.y) / 2) * height];
  }

  function isVisible(world: Vec3): boolean {
    const camera = context.camera();
    const target = new THREE.Vector3(...world);
    const distance = camera.position.distanceTo(target);
    const raycaster = context.raycaster();
    raycaster.set(camera.position, target.sub(camera.position).normalize());
    const [hit] = raycaster.intersectObjects(visibleMeshes(context.entries), false);
    const slack = Math.max(distance * 1e-3, worldPerPixel(camera.fov, distance, canvasSize()[1]) * OCCLUSION_SLACK_PX);
    return !hit || hit.distance >= distance - slack;
  }

  function entityUnderCursor(): MeasureRef | null {
    const size = canvasSize();
    const traces = projectedTraces(size);
    const cursor = cursorOnScreen(size);
    const vertex = firstVisible(vertexCandidates(traces, cursor, VERTEX_PICK_RADIUS_PX), isVisible);
    if (vertex) return vertex.target;
    const edge = firstVisible(edgeCandidates(traces, cursor, EDGE_PICK_RADIUS_PX), isVisible);
    if (edge) return edge.target;
    const face = raycastFace(context);
    return face ? { kind: "face", bodyId: face.entry.bodyId, faceId: String(face.faceId) } : null;
  }

  function pickUnderCursor(): MeasureRef | null {
    if (filter === "entity") return entityUnderCursor();
    const face = raycastFace(context);
    return face ? { kind: "body", bodyId: face.entry.bodyId } : null;
  }

  function objectFor(pick: MeasureRef, color: number): THREE.Object3D | null {
    const entry = findByBody(context.entries, pick.bodyId);
    return entry?.visible ? pickObject(entry, pick, color) : null;
  }

  function redraw() {
    const objects = picks.map((pick, index) => objectFor(pick, MEASURE_PICK_COLORS[index % MEASURE_PICK_COLORS.length]));
    overlay.setPicks([...objects, segment ? segmentObject(segment) : null].filter((object): object is THREE.Object3D => object !== null));
  }

  function clearHover() {
    hovered = null;
    overlay.setHover(null);
  }

  function handleHover(): boolean {
    attach();
    const pick = pickUnderCursor();
    if (!samePick(pick, hovered)) {
      hovered = pick;
      overlay.setHover(pick ? objectFor(pick, MEASURE_HOVER_COLOR) : null);
    }
    return pick !== null;
  }

  function handleClick() {
    options.onPicked(pickUnderCursor());
  }

  function setFilter(next: MeasureFilter) {
    filter = next;
    clearHover();
  }

  function show(nextPicks: MeasureRef[], nextSegment: [Vec3, Vec3] | null) {
    attach();
    picks = [...nextPicks];
    segment = nextSegment;
    redraw();
  }

  function forget(entry: MeshEntry) {
    if (hovered?.bodyId === entry.bodyId) clearHover();
    if (!picks.some((pick) => pick.bodyId === entry.bodyId)) return;
    picks = picks.filter((pick) => pick.bodyId !== entry.bodyId);
    segment = null;
    redraw();
  }

  return { handleHover, handleClick, setFilter, show, clearHover, forget, dispose: overlay.dispose };
}
