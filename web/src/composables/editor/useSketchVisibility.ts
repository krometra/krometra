import { useOperationSketches } from "@/composables/shared/useOperationSketches";
import { useSketch } from "@/composables/shared/useSketch";
import { isSketchOutlineShown, isSketchVisible } from "@/lib/sketchVisibility";
import { useDocumentModel, type ComponentEntry } from "./useDocumentModel";

export function useSketchVisibility() {
  const model = useDocumentModel();
  const operation = useOperationSketches();
  const sketch = useSketch();

  function isVisible(entry: ComponentEntry): boolean {
    return isSketchVisible({ visible: entry.visible, used: model.sketchHasFeature(entry.id) });
  }

  function isOutlineShown(entry: ComponentEntry): boolean {
    const inOperation = operation.ids.value.has(entry.id) || sketch.activeSketchId.value === entry.id;
    return isSketchOutlineShown({ visible: entry.visible, used: model.sketchHasFeature(entry.id), inOperation });
  }

  return { isVisible, isOutlineShown };
}
