import { computed, shallowRef, type Ref } from "vue";
import type { SketchEntity, SketchPoint } from "@/types/api";
import type { SketchTool as SketchToolName } from "@/composables/shared/useSketch";
import { useQuantityField, type QuantityField } from "@/composables/editor/useQuantityField";
import { useParameters } from "@/composables/useParameters";
import { parameterQuantities } from "@/lib/units";
import { dimensionRangeError } from "@/sketcher/dimensionKinds";
import { pickDrawableEntity } from "@/sketcher/sketchPick";
import {
  filletLines,
  findFilletCorner,
  suggestFilletRadius,
  type FilletCorner,
  type FilletSide,
} from "@/sketcher/sketchFillet";
import type { SketchEntitiesApi } from "./useSketchEntities";

type EditableSketch = Pick<SketchEntitiesApi, "entities" | "constraints" | "nextEntityId" | "nextConstraintId" | "applyEdit">;

const PICK_PX = 10;
const INPUT_OFFSET_PX = 12;

export interface FilletPrompt {
  x: number;
  y: number;
  sides: [FilletSide, FilletSide];
  field: QuantityField;
}

export function useFilletTool(deps: {
  tool: Ref<SketchToolName>;
  sketch: EditableSketch;
  zoom: () => number;
  canvasRect: () => DOMRect | undefined;
}) {
  const { sketch } = deps;
  const parameters = useParameters();
  const active = computed(() => deps.tool.value === "fillet");
  const corner = shallowRef<FilletCorner | null>(null);
  const hoveredLineId = shallowRef<string | null>(null);
  const firstSide = shallowRef<FilletSide | null>(null);
  const prompt = shallowRef<FilletPrompt | null>(null);
  let lastRadius: number | null = null;

  const threshold = () => PICK_PX / deps.zoom();

  function attempt(p: FilletPrompt, radius: number, arcId: string) {
    return filletLines(sketch.entities.value, sketch.constraints.value, p.sides, radius, {
      arcId,
      constraintId: sketch.nextConstraintId,
    });
  }

  const preview = computed<SketchEntity | null>(() => {
    const p = prompt.value;
    if (!p || p.field.invalid.value) return null;
    const result = attempt(p, p.field.value.value, "fillet-preview");
    return result.ok ? result.arc : null;
  });

  const highlightedIds = computed(() =>
    [firstSide.value?.lineId, hoveredLineId.value, ...(prompt.value?.sides.map((s) => s.lineId) ?? [])]
      .filter((id): id is string => Boolean(id)),
  );

  const marker = computed(() => (corner.value ? { at: corner.value.at, label: "Скругление" } : null));

  const hint = computed(() =>
    firstSide.value ? "Укажите второй отрезок" : "Кликните угол или два отрезка, затем введите радиус",
  );

  function openPrompt(sides: [FilletSide, FilletSide], screen: SketchPoint) {
    const rect = deps.canvasRect();
    prompt.value = {
      x: (rect?.left ?? 0) + screen.x + INPUT_OFFSET_PX,
      y: (rect?.top ?? 0) + screen.y + INPUT_OFFSET_PX,
      sides,
      field: useQuantityField({
        dimension: "length",
        initial: lastRadius ?? suggestFilletRadius(sketch.entities.value, sides),
        variables: () => parameterQuantities(parameters.parameters.value),
        rangeError: (value) => dimensionRangeError("radius", value),
      }),
    };
  }

  function move(world: SketchPoint) {
    corner.value = findFilletCorner(world, sketch.entities.value, threshold());
    const line = corner.value ? null : pickDrawableEntity(world, sketch.entities.value, threshold());
    hoveredLineId.value = line?.type === "line" ? line.id : null;
  }

  function pickLine(world: SketchPoint, screen: SketchPoint) {
    const line = pickDrawableEntity(world, sketch.entities.value, threshold());
    const first = firstSide.value;
    if (line?.type !== "line") {
      firstSide.value = null;
      return;
    }
    const side = { lineId: line.id, keep: world };
    if (!first || first.lineId === line.id) {
      firstSide.value = side;
      return;
    }
    firstSide.value = null;
    openPrompt([first, side], screen);
  }

  function click(world: SketchPoint, screen: SketchPoint) {
    prompt.value = null;
    const found = findFilletCorner(world, sketch.entities.value, threshold());
    if (!found) {
      pickLine(world, screen);
      return;
    }
    firstSide.value = null;
    openPrompt(found.sides, screen);
  }

  function type(text: string) {
    const field = prompt.value?.field;
    if (!field) return;
    field.text.value = text;
    field.onInput();
  }

  function confirm() {
    const p = prompt.value;
    if (!p) return;
    p.field.commit();
    if (p.field.invalid.value) return;
    const result = attempt(p, p.field.value.value, sketch.nextEntityId());
    if (!result.ok) {
      p.field.error.value = result.error;
      return;
    }
    lastRadius = p.field.value.value;
    prompt.value = null;
    corner.value = null;
    sketch.applyEdit(result.edit);
  }

  function cancelStep(): boolean {
    if (!prompt.value && !firstSide.value) return false;
    prompt.value = null;
    firstSide.value = null;
    return true;
  }

  function reset() {
    corner.value = null;
    hoveredLineId.value = null;
    firstSide.value = null;
    prompt.value = null;
  }

  return { active, prompt, preview, highlightedIds, marker, hint, move, click, type, confirm, cancelStep, reset };
}

export type FilletToolApi = ReturnType<typeof useFilletTool>;
