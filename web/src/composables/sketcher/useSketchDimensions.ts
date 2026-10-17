import type { SketchPoint } from "@/types/api";
import { useParameters } from "@/composables/useParameters";
import { parameterQuantities } from "@/lib/units";
import { findDimensionLabelAt } from "@/sketcher/dimensionLayout";
import type { DimensionDraft, DimensionTarget } from "@/sketcher/dimensionPlan";
import { useDimensionInput } from "./useDimensionInput";
import { useDimensionTool } from "./useDimensionTool";
import type { SketchEntitiesApi } from "./useSketchEntities";

const INPUT_BELOW_CURSOR_PX = 12;
const TOOLBAR_INPUT = { offsetX: -50, y: 88 };

export function useSketchDimensions(deps: {
  sketch: SketchEntitiesApi;
  zoom: () => number;
  screenToWorld: (sx: number, sy: number) => SketchPoint;
  canvasRect: () => DOMRect | undefined;
}) {
  const { sketch } = deps;
  const parameters = useParameters();

  function toClient(sx: number, sy: number) {
    const rect = deps.canvasRect();
    return { x: (rect?.left ?? 0) + sx, y: (rect?.top ?? 0) + sy + INPUT_BELOW_CURSOR_PX };
  }

  function toolbarPoint() {
    return { x: (deps.canvasRect()?.width ?? 0) / 2 + TOOLBAR_INPUT.offsetX, y: TOOLBAR_INPUT.y };
  }

  function createDimension(draft: DimensionDraft, value: number) {
    sketch.addConstraint({ id: sketch.nextConstraintId(), type: draft.type, anchors: draft.anchors, value });
    sketch.clearSelection();
    sketch.solveAndApply();
  }

  const input = useDimensionInput({
    variables: () => parameterQuantities(parameters.parameters.value),
    create: createDimension,
    update: sketch.setConstraintValue,
  });

  const tool = useDimensionTool({
    entities: sketch.entities,
    zoom: deps.zoom,
    screenToWorld: deps.screenToWorld,
    open: (draft, at) => input.openCreate(draft, toClient(at.x, at.y)),
  });

  function labelAt(sx: number, sy: number): string | null {
    return findDimensionLabelAt(sketch.constraints.value, sketch.entities.value, deps.screenToWorld(sx, sy), 1 / deps.zoom());
  }

  function editAt(sx: number, sy: number) {
    const id = labelAt(sx, sy);
    const constraint = sketch.constraints.value.find((c) => c.id === id);
    if (constraint) input.openEdit(constraint, toClient(sx, sy));
  }

  function openFromToolbar(draft: DimensionDraft) {
    const at = toolbarPoint();
    input.openCreate(draft, toClient(at.x, at.y));
  }

  function startFromSelection() {
    const targets = sketch.selection.targets().filter((t): t is DimensionTarget => t !== null);
    if (targets.length === 0) return;
    tool.startFromTargets(targets, toolbarPoint());
    sketch.clearSelection();
  }

  function reset() {
    tool.reset();
    input.cancel();
  }

  return { input, tool, labelAt, editAt, openFromToolbar, startFromSelection, reset };
}

export type SketchDimensionsApi = ReturnType<typeof useSketchDimensions>;
