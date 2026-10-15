import * as THREE from "three";
import type { BrepTopo } from "@/types/api";
import type { MeshEntry, SceneContext } from "./types";
import { findByBody } from "./types";
import { unclippedHits } from "./clipRaycast";
import { bestEdgeHit, edgePickThreshold } from "./edgePicking";
import { buildEdgeLines, disposeEdgeLines, styleEdgeLine, visibleEdgeLines, type EdgeStyle } from "./edgeLines";
import {
  buildEdgeTopology,
  pickedEdges,
  selectionGroups,
  togglePicked,
  type EdgeId,
  type EdgePick,
  type EdgeTopology,
} from "./edgeGroups";
import { raycastFace } from "./faceRaycast";

export interface EdgeRef {
  bodyId: string;
  edgeId: EdgeId;
}

export interface EdgeSelectionSnapshot {
  bodyId: string | null;
  edgeIds: EdgeId[];
  groups: EdgeId[][];
  chain: boolean;
  brepTopo: BrepTopo | null;
}

interface EdgeTarget {
  bodyId: string;
  edgeIds: EdgeId[];
  pick: EdgePick;
}

interface EdgeHighlight {
  bodyId: string;
  edgeIds: EdgeId[];
  source: string;
  hitEdgeId: EdgeId | null;
}

const LIST_SOURCE = "list";

function highlightOf(target: EdgeTarget): EdgeHighlight {
  const { bodyId, edgeIds, pick } = target;
  return pick.kind === "edge"
    ? { bodyId, edgeIds, source: `${bodyId}/edge/${pick.edgeId}`, hitEdgeId: pick.edgeId }
    : { bodyId, edgeIds, source: `${bodyId}/face/${pick.faceId}`, hitEdgeId: null };
}

/**
 * Выбор рёбер одного тела: линии поверх тела, ховер и выделение группами —
 * касательной цепочкой от ребра или всеми рёбрами грани.
 */
export function useEdgeSelection(options: {
  context: SceneContext;
  onChanged: (snapshot: EdgeSelectionSnapshot) => void;
}) {
  const { context } = options;
  const topologies = new WeakMap<BrepTopo, EdgeTopology>();
  let selectedBodyId: string | null = null;
  let selectedEdgeIds: EdgeId[] = [];
  let chain = true;
  let highlighted: EdgeHighlight | null = null;

  function topologyOf(entry: MeshEntry): EdgeTopology {
    const cached = topologies.get(entry.brepTopo);
    if (cached) return cached;
    const topology = buildEdgeTopology(entry.brepTopo);
    topologies.set(entry.brepTopo, topology);
    return topology;
  }

  function styleOf(bodyId: string, edgeId: EdgeId): EdgeStyle {
    const selected = bodyId === selectedBodyId && selectedEdgeIds.includes(edgeId);
    const lit = highlighted?.bodyId === bodyId && highlighted.edgeIds.includes(edgeId);
    if (lit) return selected ? "focus" : "hover";
    return selected ? "selected" : "default";
  }

  function repaint(bodyId: string | null, edgeIds: EdgeId[]) {
    const lines = bodyId ? findByBody(context.entries, bodyId)?.edgeLines : undefined;
    if (!bodyId || !lines) return;
    for (const edgeId of edgeIds) styleEdgeLine(lines, edgeId, styleOf(bodyId, edgeId));
  }

  function ensureEdgeLines(entry: MeshEntry) {
    if (!entry.edgeLines) {
      entry.edgeLines = buildEdgeLines(entry);
      repaint(entry.bodyId, selectedEdgeIds);
      repaint(entry.bodyId, highlighted?.edgeIds ?? []);
    }
    if (!context.meshGroup.children.includes(entry.edgeLines)) {
      context.meshGroup.add(entry.edgeLines);
    }
  }

  function removeEdgeLines(entry: MeshEntry) {
    if (!entry.edgeLines) return;
    context.meshGroup.remove(entry.edgeLines);
    disposeEdgeLines(entry.edgeLines);
    entry.edgeLines = undefined;
  }

  function ensureAll() {
    for (const entry of context.entries) {
      if (entry.visible) ensureEdgeLines(entry);
    }
  }

  function snapshot(): EdgeSelectionSnapshot {
    const entry = selectedBodyId ? findByBody(context.entries, selectedBodyId) : undefined;
    return {
      bodyId: selectedBodyId,
      edgeIds: [...selectedEdgeIds],
      groups: entry ? selectionGroups(topologyOf(entry), selectedEdgeIds, chain) : [],
      chain,
      brepTopo: entry?.brepTopo ?? null,
    };
  }

  function commit(bodyId: string | null, edgeIds: EdgeId[]) {
    const previous = { bodyId: selectedBodyId, edgeIds: selectedEdgeIds };
    selectedBodyId = edgeIds.length > 0 ? bodyId : null;
    selectedEdgeIds = edgeIds;
    repaint(previous.bodyId, previous.edgeIds);
    repaint(selectedBodyId, selectedEdgeIds);
    options.onChanged(snapshot());
  }

  function setHighlight(next: EdgeHighlight | null) {
    const previous = highlighted;
    highlighted = next;
    if (previous) repaint(previous.bodyId, previous.edgeIds);
    if (next) repaint(next.bodyId, next.edgeIds);
  }

  function pixelsFromCursor(point: THREE.Vector3): number {
    const camera = context.camera();
    const canvas = context.renderer().domElement;
    const pointer = context.pointer();
    const ndc = point.clone().project(camera);
    const dx = ((ndc.x - pointer.x) * canvas.clientWidth) / 2;
    const dy = ((ndc.y - pointer.y) * canvas.clientHeight) / 2;
    return Math.hypot(dx, dy);
  }

  function pickEdge(): EdgeRef | null {
    const camera = context.camera();
    const raycaster = context.raycaster();
    raycaster.setFromCamera(context.pointer(), camera);

    const allLines = visibleEdgeLines(context.entries);
    if (allLines.length === 0) return null;

    const threshold = edgePickThreshold(
      camera.fov,
      camera.position.distanceTo(context.controls().target),
      context.renderer().domElement.clientHeight,
    );
    const oldThreshold = raycaster.params.Line?.threshold ?? 0;
    raycaster.params.Line = { threshold };
    const intersects = unclippedHits(context, raycaster.intersectObjects(allLines, false));
    raycaster.params.Line = { threshold: oldThreshold };

    const best = bestEdgeHit(
      intersects.map((hit) => ({ hit, px: pixelsFromCursor(hit.point), distance: hit.distance })),
    );
    if (!best) return null;

    const line = best.hit.object as THREE.Line;
    const edgeId: EdgeId = line.userData["edgeId"];
    const bodyId: string = line.userData["bodyId"];
    if (edgeId === undefined || !bodyId) return null;
    return { bodyId, edgeId };
  }

  function targetOf(bodyId: string, pick: EdgePick): EdgeTarget | null {
    const entry = findByBody(context.entries, bodyId);
    if (!entry) return null;
    const edgeIds = pickedEdges(topologyOf(entry), pick, chain);
    return edgeIds.length > 0 ? { bodyId, pick, edgeIds } : null;
  }

  function targetUnderCursor(): EdgeTarget | null {
    const edge = pickEdge();
    if (edge) return targetOf(edge.bodyId, { kind: "edge", edgeId: edge.edgeId });
    const face = raycastFace(context);
    return face ? targetOf(face.entry.bodyId, { kind: "face", faceId: face.faceId }) : null;
  }

  function toggle(target: EdgeTarget) {
    const current = target.bodyId === selectedBodyId ? selectedEdgeIds : [];
    commit(target.bodyId, togglePicked(current, target.edgeIds, target.pick));
  }

  function handleHover(): boolean {
    ensureAll();
    const target = targetUnderCursor();
    const next = target ? highlightOf(target) : null;
    if (next?.source !== highlighted?.source) setHighlight(next);
    return target !== null;
  }

  function handleClick() {
    ensureAll();
    const target = targetUnderCursor();
    // Клик в пустоту рёбра не сбрасывает — пользователь управляет через тулбар
    if (target) toggle(target);
  }

  function toggleEdge(bodyId: string, edgeId: EdgeId) {
    setHighlight(null);
    const target = targetOf(bodyId, { kind: "edge", edgeId });
    if (target) toggle(target);
  }

  function highlight(bodyId: string, edgeIds: EdgeId[]) {
    setHighlight({ bodyId, edgeIds: [...edgeIds], source: LIST_SOURCE, hitEdgeId: null });
  }

  function clearHover() {
    setHighlight(null);
  }

  function setChain(enabled: boolean) {
    if (chain === enabled) return;
    chain = enabled;
    setHighlight(null);
    options.onChanged(snapshot());
  }

  function selectById(bodyId: string, edgeId: string): boolean {
    const entry = findByBody(context.entries, bodyId);
    const edge = entry?.brepTopo.edges?.find((candidate) => String(candidate.edge_id) === edgeId);
    if (!entry?.visible || !edge) return false;
    ensureEdgeLines(entry);
    const current = bodyId === selectedBodyId ? selectedEdgeIds : [];
    if (!current.includes(edge.edge_id)) commit(bodyId, [...current, edge.edge_id]);
    return true;
  }

  function clearSelection() {
    commit(null, []);
  }

  function clearAllEdgeLines() {
    for (const entry of context.entries) removeEdgeLines(entry);
    highlighted = null;
    if (selectedEdgeIds.length > 0) commit(null, []);
  }

  function getSelected(): EdgeRef[] {
    const bodyId = selectedBodyId;
    return bodyId ? selectedEdgeIds.map((edgeId) => ({ bodyId, edgeId })) : [];
  }

  function getHighlighted(): EdgeRef[] {
    const current = highlighted;
    return current ? current.edgeIds.map((edgeId) => ({ bodyId: current.bodyId, edgeId })) : [];
  }

  function getHovered(): EdgeRef | null {
    const edgeId = highlighted?.hitEdgeId ?? null;
    return highlighted && edgeId !== null ? { bodyId: highlighted.bodyId, edgeId } : null;
  }

  /** Тело уходит из сцены: линии освобождаются, ховер на нём забывается. */
  function forget(entry: MeshEntry) {
    removeEdgeLines(entry);
    if (highlighted?.bodyId === entry.bodyId) highlighted = null;
  }

  return {
    ensureAll,
    handleClick,
    handleHover,
    clearHover,
    toggleEdge,
    selectById,
    highlight,
    setChain,
    clearSelection,
    clearAllEdgeLines,
    getSelected,
    getHovered,
    getHighlighted,
    forget,
  };
}
