import { describe, expect, it } from "vitest";
import { holeDetail, holeLabel, holeParamFields, holeParamsOf, holeSketchPlacement, holeSpecFromParams, holeSummaryRows, holeWorkerRequest } from "./holeFeature";
import { DEFAULT_HOLE_SPEC, type HoleSpec } from "./holeGeometry";

const counterbore: HoleSpec = { ...DEFAULT_HOLE_SPEC, type: "counterbore", diameter: 5.5, depth: 12, cboreDiameter: 10, cboreDepth: 5.5 };

describe("параметры отверстия в истории", () => {
  it("переводит спецификацию в параметры записи и обратно", () => {
    const params = holeParamsOf(counterbore);

    expect(params).toEqual({
      hole_type: "counterbore", diameter: 5.5, extent: "distance", depth: 12, bottom: "flat",
      cbore_diameter: 10, cbore_depth: 5.5, csink_diameter: 10, csink_angle: 90,
    });
    expect(holeSpecFromParams(params)).toEqual(counterbore);
  });

  it("недостающие и испорченные значения заменяет значениями по умолчанию", () => {
    expect(holeSpecFromParams({ hole_type: "tapped", diameter: "5", extent: null, csink_angle: Number.NaN })).toEqual(DEFAULT_HOLE_SPEC);
  });

  it("подписывает операцию типом, размерами и числом отверстий", () => {
    expect(holeLabel(DEFAULT_HOLE_SPEC, 1)).toBe("Отверстие ⌀5 · 10 мм");
    expect(holeLabel(counterbore, 4)).toBe("Отверстие с цековкой ⌀5.5/⌀10 · 12 мм · 4 шт.");
    expect(holeLabel({ ...DEFAULT_HOLE_SPEC, type: "countersink", extent: "through_all" }, 2)).toBe("Отверстие с зенковкой ⌀5/⌀10×90° · насквозь · 2 шт.");
  });

  it("короткая подпись для ленты истории", () => {
    expect(holeDetail({ ...holeParamsOf(DEFAULT_HOLE_SPEC), centers: [[0, 0, 0], [1, 0, 0]] })).toBe("⌀5 · 10 мм · 2 шт.");
    expect(holeDetail({ ...holeParamsOf(DEFAULT_HOLE_SPEC), centers: [[0, 0, 0]] })).toBe("⌀5 · 10 мм");
  });

  it("поля правки из дерева зависят от типа и предела", () => {
    const keys = (values: Record<string, string | number>) => holeParamFields(values).map((field) => field.key);

    expect(keys(holeParamsOf(DEFAULT_HOLE_SPEC))).toEqual(["hole_type", "diameter", "extent", "depth", "bottom"]);
    expect(keys(holeParamsOf(counterbore))).toEqual(["hole_type", "diameter", "extent", "depth", "bottom", "cbore_diameter", "cbore_depth"]);
    expect(keys(holeParamsOf({ ...DEFAULT_HOLE_SPEC, type: "countersink", extent: "through_all" }))).toEqual([
      "hole_type", "diameter", "extent", "csink_diameter", "csink_angle",
    ]);
    expect(holeParamFields(holeParamsOf(DEFAULT_HOLE_SPEC))[0].options?.map((option) => option.value)).toEqual(["simple", "counterbore", "countersink"]);
  });

  it("эскиз годится под центры, только если в нём есть окружности", () => {
    const circle = { id: "c", type: "circle", center: { x: 1, y: 2 }, radius: 1 };

    expect(holeSketchPlacement({ plane: "XZ", plane_offset: 3, entities: [circle] })).toEqual({
      entities: [circle], plane: "XZ", planeOffset: 3, planeBasis: null,
    });
    expect(holeSketchPlacement({ plane: "XY", entities: [{ id: "l", type: "line" }] })).toBeNull();
    expect(holeSketchPlacement({ plane: "XY" })).toBeNull();
  });

  it("запрос ядру несёт центры, а при эскизе — его сущности и плоскость", () => {
    const target = { bodyId: "b", faceId: "f-top", facePoints: [], centers: [[1, 2, 3]] as [number, number, number][], sketch: null };

    expect(holeWorkerRequest(target, DEFAULT_HOLE_SPEC, "k-1")).toEqual({
      kind: "hole", bodyId: "b", faceId: "f-top", facePoints: [], centers: [[1, 2, 3]], entities: null,
      plane: "XY", planeOffset: 0, planeBasis: null, spec: DEFAULT_HOLE_SPEC, featureKey: "k-1",
    });
    const sketch = { sketchId: "s", entities: [], plane: "YZ" as const, planeOffset: 2, planeBasis: null };
    expect(holeWorkerRequest({ ...target, sketch }, DEFAULT_HOLE_SPEC, "k-1")).toMatchObject({ entities: [], plane: "YZ", planeOffset: 2 });
  });

  it("строки свойств показывают только то, что относится к типу отверстия", () => {
    expect(holeSummaryRows({ ...holeParamsOf(counterbore), centers: [[0, 0, 0]] })).toEqual([
      { label: "Тип", value: "Цековка" },
      { label: "Диаметр", value: "5.5 мм" },
      { label: "Глубина", value: "12 мм" },
      { label: "Дно", value: "Плоское" },
      { label: "Цековка", value: "⌀10 × 5.5 мм" },
      { label: "Отверстий", value: "1" },
    ]);
    expect(holeSummaryRows({ ...holeParamsOf({ ...DEFAULT_HOLE_SPEC, extent: "through_all" }) }).map((row) => row.label)).toEqual([
      "Тип", "Диаметр", "Глубина", "Отверстий",
    ]);
  });
});
