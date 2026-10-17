import { describe, expect, it, vi } from "vitest";
import type { SketchEntity } from "@/types/api";
import { useSketchEntities } from "./useSketchEntities";

const side: SketchEntity = { id: "s", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
const aux: SketchEntity = { id: "aux", type: "infline", point: { x: 0, y: 5 }, angle: 0 };
const helper: SketchEntity = { id: "k", type: "line", start: { x: 0, y: 8 }, end: { x: 10, y: 8 }, construction: true };

describe("useSketchEntities.removeSelected", () => {
  it("Delete удаляет выбранную вспомогательную геометрию и её ограничения, точки и оси не удаляют ничего", () => {
    const onChange = vi.fn();
    const sketch = useSketchEntities(onChange);
    sketch.load({
      entities: [side, aux, helper],
      constraints: [
        { id: "c1", type: "parallel", anchors: [{ entity_id: "aux", sub_index: 0 }, { entity_id: "s", sub_index: 0 }], value: null },
        { id: "c2", type: "horizontal", anchors: [{ entity_id: "s", sub_index: 0 }], value: null },
      ],
    });

    sketch.selection.set([{ kind: "point", entityId: "s", subIndex: 1 }, { kind: "axis", axis: "x" }]);
    sketch.removeSelected();
    expect(sketch.entities.value).toHaveLength(3);
    expect(sketch.selection.items.value).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();

    sketch.selection.set([{ kind: "entity", entityId: "aux" }, { kind: "entity", entityId: "k" }]);
    sketch.removeSelected();
    expect(sketch.entities.value.map((e) => e.id)).toEqual(["s"]);
    expect(sketch.constraints.value.map((c) => c.id)).toEqual(["c2"]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
