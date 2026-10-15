import { describe, expect, it } from "vitest";
import type { MeasuredBody, MeasuredEdge, MeasureResult } from "./measure";
import { CUSTOM_MATERIAL_ID, DEFAULT_MATERIAL, fixed, itemTitle, massGrams, materialForDensity, MATERIALS, measureGroups, pickTitle } from "./measureFormat";

const cube: MeasuredBody = {
  kind: "body", volume: 1000, area: 600, centerOfMass: [5, 5, 5], bbox: { min: [0, 0, 0], max: [10, 10, 10] },
};

const arc: MeasuredEdge = {
  kind: "edge", curve: "circle", length: Math.PI, start: [2, 0, 0], end: [-2, 0, 0], closed: false,
  direction: null, radius: 2, center: [0, 0, 0], axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
};

function values(result: MeasureResult, groupIndex = 0) {
  return Object.fromEntries(measureGroups(result, [], DEFAULT_MATERIAL.density)[groupIndex].rows.map((row) => [row.label, row.value]));
}

describe("massGrams", () => {
  it("кубический сантиметр стали весит 7.85 г", () => {
    expect(massGrams(1000, 7.85)).toBeCloseTo(7.85);
  });

  it("по умолчанию — сталь, в списке есть пластики для печати", () => {
    expect(DEFAULT_MATERIAL).toMatchObject({ label: "Сталь", density: 7.85 });
    expect(MATERIALS.map((material) => material.id)).toEqual(expect.arrayContaining(["aluminium", "pla", "petg"]));
  });
});

describe("materialForDensity", () => {
  it("своя плотность снимает выбор материала, совпадающая — оставляет", () => {
    expect(materialForDensity("steel", 7.85)).toBe("steel");
    expect(materialForDensity("steel", 7.8)).toBe(CUSTOM_MATERIAL_ID);
    expect(materialForDensity(CUSTOM_MATERIAL_ID, 2.7)).toBe(CUSTOM_MATERIAL_ID);
  });
});

describe("fixed", () => {
  it("не показывает минус у нуля", () => {
    expect(fixed(-0.0001)).toBe("0.000");
    expect(fixed(1.23456, 2)).toBe("1.23");
  });
});

describe("measureGroups", () => {
  it("тело: объём, площадь, центр масс, габарит и масса по материалу", () => {
    expect(values({ items: [cube], pair: null })).toEqual({
      "Объём": "1000.000 мм³",
      "Площадь поверхности": "600.000 мм²",
      "Центр масс": "5.000, 5.000, 5.000 мм",
      "Габарит": "10.000 × 10.000 × 10.000 мм",
      "Масса": "7.85 г",
    });
    const heavy = measureGroups({ items: [{ ...cube, volume: 1_000_000 }], pair: null }, [], 2.7);
    expect(heavy[0].rows.find((row) => row.label === "Масса")!.value).toBe("2.700 кг");
  });

  it("дуга: радиус, диаметр, центр и угол дуги", () => {
    expect(values({ items: [arc], pair: null })).toMatchObject({
      "Длина": "3.142 мм",
      "Радиус": "2.000 мм",
      "Диаметр": "4.000 мм",
      "Угол дуги": "90.00 °",
    });
    expect(itemTitle(arc)).toBe("Ребро — дуга");
    expect(pickTitle({ kind: "edge", bodyId: "b1", edgeId: "e1" })).toBe("Ребро");
  });

  it("пара: сначала связь между объектами, копируется число без единиц", () => {
    const groups = measureGroups({
      items: [{ kind: "vertex", point: [0, 0, 0] }, { kind: "vertex", point: [3, 4, 0] }],
      pair: { distance: 5, points: [[0, 0, 0], [3, 4, 0]], delta: [3, 4, 0], angle: null, axisDistance: null, centerDistance: null },
    }, ["Вершина · Тело 1", "Вершина · Тело 2"], DEFAULT_MATERIAL.density);
    expect(groups.map((group) => group.title)).toEqual(["Между объектами", "Вершина · Тело 1", "Вершина · Тело 2"]);
    expect(groups[0].rows.map((row) => row.label)).toEqual(["Расстояние", "ΔX, ΔY, ΔZ"]);
    expect(groups[0].rows[0]).toMatchObject({ value: "5.000 мм", copy: "5.000" });
  });
});
