import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import { sketchRegions } from "@/lib/sketchRegions";
import type { SketchEntity } from "@/types/api";
import type { EditorControlContext } from "./controlContext";

export const PROFILE_REGIONS_HELP =
  "Ключи регионов профиля из op sketch.regions: выдавливается только их объединение, смежные сливаются в одну грань. Без параметра — весь эскиз, как раньше.";

const round = (value: number) => Math.round(value * 1e6) / 1e6;

export function regionOps(context: EditorControlContext): ControlOp[] {
  return [
    defineOp({
      op: "sketch.regions",
      description:
        "Регионы сохранённого эскиза: замкнутые области, на которые его делят пересекающиеся отрезки, дуги и окружности, с учётом отверстий. Ответ { regions: [{ key, area, point: [x, y], holes }] }: key — стабильный ключ для profileRegions у extrude и revolve (переживает правку размеров, пока пересечения те же), area — площадь в мм², point — точка внутри региона в координатах эскиза, holes — число отверстий.",
      mutates: false,
      params: {
        sketchId: param.id("Эскиз из op state."),
      },
      run: async ({ sketchId }) => {
        context.requireSketch(sketchId);
        const sketch = context.model.sketches.value.find((candidate) => candidate.id === sketchId);
        const entities = (sketch?.entities as SketchEntity[] | undefined) ?? [];
        try {
          return {
            regions: sketchRegions(entities).map((region) => ({
              key: region.key,
              area: round(region.area),
              point: [round(region.point.x), round(region.point.y)],
              holes: region.holes.length,
            })),
          };
        } catch (error) {
          throw fail("operation_failed", error instanceof Error ? error.message : String(error));
        }
      },
    }),
  ];
}

export function selectProfileRegions(context: EditorControlContext, keys: string[] | undefined) {
  if (keys === undefined) return;
  const missing = context.extrude.profile.select(keys);
  if (missing.length > 0) {
    context.extrude.clearSketchContext();
    throw fail("not_found", `В эскизе нет регионов: ${missing.join(", ")}. Список регионов — op "sketch.regions".`);
  }
}
