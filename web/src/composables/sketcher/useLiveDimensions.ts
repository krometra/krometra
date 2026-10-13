import { nextTick, ref, type Ref } from "vue";
import type { SketchTool as SketchToolName } from "@/composables/shared/useSketch";
import type { RectangleTool } from "@/components/sketcher/tools/RectangleTool";
import type { CircleTool } from "@/components/sketcher/tools/CircleTool";

export interface LiveDimField {
  key: "w" | "h" | "r";
  label: string;
  value: string;
  live: string;
}

/**
 * Живой ввод размеров во время рисования (прямоугольник: Ш/В, окружность: R).
 * Одна подсистема на все инструменты: поле появляется после первого клика,
 * сразу получает фокус, значение перебивает перетаскивание мышью.
 */
export function useLiveDimensions(deps: {
  tool: Ref<SketchToolName>;
  rectangleTool: RectangleTool;
  circleTool: CircleTool;
  canvasRect: () => DOMRect | undefined;
  inputs: () => HTMLInputElement[];
}) {
  const { tool, rectangleTool, circleTool, canvasRect, inputs } = deps;

  const liveDims = ref<{ x: number; y: number; fields: LiveDimField[] } | null>(null);

  function fieldsForTool(): LiveDimField[] {
    if (tool.value === "rectangle") {
      return [
        { key: "w", label: "Ш", value: "", live: "0" },
        { key: "h", label: "В", value: "", live: "0" },
      ];
    }
    if (tool.value === "circle") {
      return [{ key: "r", label: "R", value: "", live: "0" }];
    }
    return [];
  }

  function focusFirstInput() {
    nextTick(() => {
      const input = inputs()[0];
      input?.focus();
      input?.select();
    });
  }

  function open(screenX: number, screenY: number) {
    const fields = fieldsForTool();
    if (fields.length === 0) return;
    const rect = canvasRect();
    liveDims.value = {
      x: (rect?.left ?? 0) + screenX + 16,
      y: (rect?.top ?? 0) + screenY + 16,
      fields,
    };
    focusFirstInput();
  }

  function close() {
    liveDims.value = null;
    rectangleTool.setDimensionOverride(null, null);
    circleTool.setRadiusOverride(null);
  }

  function fieldValue(key: LiveDimField["key"]): number | null {
    const raw = liveDims.value?.fields.find((f) => f.key === key)?.value ?? "";
    const parsed = parseFloat(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function applyOverrides() {
    if (!liveDims.value) return;
    if (tool.value === "rectangle") {
      rectangleTool.setDimensionOverride(fieldValue("w"), fieldValue("h"));
    } else if (tool.value === "circle") {
      circleTool.setRadiusOverride(fieldValue("r"));
    }
  }

  function updateReadout() {
    const dims = liveDims.value;
    if (!dims) return;
    for (const field of dims.fields) {
      if (field.key === "r") {
        field.live = (circleTool.getRadius() ?? 0).toFixed(1);
        continue;
      }
      const size = rectangleTool.getSize();
      if (!size) continue;
      field.live = (field.key === "w" ? size.width : size.height).toFixed(1);
    }
  }

  function focusNextInput(index: number) {
    const fields = inputs();
    if (fields.length === 0) return;
    const next = fields[(index + 1) % fields.length];
    next?.focus();
    next?.select();
  }

  return {
    liveDims,
    open,
    close,
    applyOverrides,
    updateReadout,
    focusFirstInput,
    focusNextInput,
  };
}

export type LiveDimensionsApi = ReturnType<typeof useLiveDimensions>;
