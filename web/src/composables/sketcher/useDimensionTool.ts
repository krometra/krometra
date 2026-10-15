import { computed, ref, shallowRef, type Ref } from "vue";
import type { SketchEntity, SketchPoint } from "@/types/api";
import {
  defaultCursor,
  resolveDimension,
  sameTarget,
  type DimensionDraft,
  type DimensionResolution,
  type DimensionTarget,
} from "@/sketcher/dimensionPlan";
import { pickDimensionTarget, targetOfEntity } from "@/sketcher/dimensionTargets";
import { dimensionText, dimensionTitle } from "@/sketcher/dimensionKinds";
import { SKETCH_ORIGIN_ID } from "@/sketcher/sketchOrigin";

const PICK_PX = 10;

export function useDimensionTool(deps: {
  entities: Ref<SketchEntity[]>;
  zoom: () => number;
  screenToWorld: (sx: number, sy: number) => SketchPoint;
  open: (draft: DimensionDraft, screen: { x: number; y: number }) => void;
}) {
  const targets = shallowRef<DimensionTarget[]>([]);
  const hovered = shallowRef<DimensionTarget | null>(null);
  const cursor = ref<SketchPoint>({ x: 0, y: 0 });

  const resolution = computed<DimensionResolution>(() => resolveDimension(targets.value, cursor.value));

  const hint = computed(() => {
    const r = resolution.value;
    if (r.status === "incomplete") return r.hint;
    if (r.status === "invalid") return `Размер недоступен: ${r.reason}`;
    const text = `${dimensionTitle(r.draft.type)} ${dimensionText(r.draft.type, r.draft.value)}`;
    return r.placement === "cursor" ? `${text} — кликните, чтобы поставить размер` : text;
  });

  const highlightedIds = computed(() =>
    [...targets.value, ...(hovered.value ? [hovered.value] : [])]
      .map((t) => t.ref.entity_id)
      .filter((id) => id !== SKETCH_ORIGIN_ID),
  );

  const marker = computed(() => {
    const point = [hovered.value, ...targets.value].find((t) => t?.kind === "point");
    return point?.kind === "point" ? { at: point.at, label: point.label ?? null } : null;
  });

  function pickAt(world: SketchPoint): DimensionTarget | null {
    return pickDimensionTarget(world, deps.entities.value, PICK_PX / deps.zoom());
  }

  function reset() {
    targets.value = [];
    hovered.value = null;
  }

  function place(draft: DimensionDraft, screen: { x: number; y: number }) {
    reset();
    deps.open(draft, screen);
  }

  function addTarget(target: DimensionTarget) {
    const current = targets.value;
    if (current.some((t) => sameTarget(t, target))) {
      targets.value = current.filter((t) => !sameTarget(t, target));
      return;
    }
    targets.value = current.length >= 2 || resolution.value.status === "invalid" ? [target] : [...current, target];
  }

  function onClick(sx: number, sy: number) {
    const world = deps.screenToWorld(sx, sy);
    cursor.value = world;
    const hit = pickAt(world);
    const before = resolution.value;
    if (!hit) {
      if (before.status === "ready") place(before.draft, { x: sx, y: sy });
      else reset();
      return;
    }
    addTarget(hit);
    const after = resolution.value;
    if (after.status === "ready" && after.placement === "immediate") place(after.draft, { x: sx, y: sy });
  }

  function onMove(sx: number, sy: number) {
    const world = deps.screenToWorld(sx, sy);
    cursor.value = world;
    hovered.value = pickAt(world);
  }

  function startFromEntities(entities: SketchEntity[], screen: { x: number; y: number }) {
    const picked = entities.map(targetOfEntity).filter((t): t is DimensionTarget => t !== null);
    if (picked.length === 0) return;
    targets.value = picked;
    cursor.value = defaultCursor(picked);
    const r = resolution.value;
    if (r.status === "ready" && r.placement === "immediate") place(r.draft, screen);
  }

  function isPicking(): boolean {
    return targets.value.length > 0;
  }

  return { targets, hint, highlightedIds, marker, onClick, onMove, reset, startFromEntities, isPicking };
}

export type DimensionToolApi = ReturnType<typeof useDimensionTool>;
