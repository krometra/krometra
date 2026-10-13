import { watch, type Ref } from "vue";
import type { PlaneBasis, SketchEntity, SketchPlane } from "@/types/api";
import type { ComponentEntry } from "./useDocumentModel";

interface SketchOutlineFrame {
  plane: SketchPlane;
  offset: number;
  basis: PlaneBasis | null;
}

interface OutlineViewport {
  addSketchOutline(sketchId: string, entities: SketchEntity[], frame: SketchOutlineFrame): void;
}

function sketchFrame(sketch: ComponentEntry): SketchOutlineFrame {
  return {
    plane: (sketch.plane as SketchPlane) ?? "XY",
    offset: typeof sketch.plane_offset === "number" ? sketch.plane_offset : 0,
    basis: (sketch.plane_basis as PlaneBasis | null) ?? null,
  };
}

export function useSketchOutlineSync(viewportRef: Ref<OutlineViewport | undefined>, sketches: Ref<ComponentEntry[]>) {
  function draw(sketch: ComponentEntry) {
    viewportRef.value?.addSketchOutline(sketch.id, (sketch.entities as SketchEntity[]) ?? [], sketchFrame(sketch));
  }

  function drawAll() {
    sketches.value.forEach(draw);
  }

  watch(
    () => new Map(sketches.value.map((sketch) => [sketch.id, JSON.stringify(sketchFrame(sketch))])),
    (frames, previous) => {
      for (const sketch of sketches.value) {
        const before = previous.get(sketch.id);
        if (before !== undefined && before !== frames.get(sketch.id)) draw(sketch);
      }
    },
  );

  return { drawAll };
}
