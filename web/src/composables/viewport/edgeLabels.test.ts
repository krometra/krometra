import { describe, expect, it } from "vitest";
import { describeEdge, edgeGroupLabel, edgeGroupRows, edgeLabel } from "./edgeLabels";
import { arcEdge, lineEdge, ROUNDED_LOOP, roundedBoxTopo } from "./edgeFixtures";

describe("describeEdge", () => {
  it("отрезок", () => {
    expect(describeEdge(lineEdge("l", [0, 0, 0], [0, 20, 0]).polyline)).toEqual({ kind: "line", length: 20 });
  });

  it("прямое ребро из нескольких сегментов остаётся отрезком", () => {
    expect(describeEdge([0, 0, 0, 1, 0, 0, 1, 0, 0, 4, 0, 0]).kind).toBe("line");
  });

  it("дуга: радиус и длина по окружности, а не по хордам", () => {
    const shape = describeEdge(arcEdge("a", [1, 2, 3], 3, 0, 90, 4).polyline);
    expect(shape.kind).toBe("arc");
    expect(shape).toMatchObject({ radius: expect.closeTo(3, 9), length: expect.closeTo((3 * Math.PI) / 2, 9) });
  });

  it("замкнутая окружность", () => {
    const shape = describeEdge(arcEdge("c", [0, 0, 5], 2, 0, 360, 48).polyline);
    expect(shape).toMatchObject({ kind: "circle", radius: expect.closeTo(2, 9), length: expect.closeTo(4 * Math.PI, 9) });
  });

  it("неплоская кривая окружностью не считается", () => {
    const helix: number[] = [];
    for (let step = 0; step <= 24; step++) {
      const angle = (step * Math.PI) / 12;
      helix.push(Math.cos(angle), Math.sin(angle), step * 0.2);
    }
    expect(describeEdge(helix).kind).toBe("curve");
  });

  it("ребро без полилинии — отрезок нулевой длины", () => {
    expect(describeEdge(undefined)).toEqual({ kind: "line", length: 0 });
  });
});

describe("подписи", () => {
  it("называют форму и размер ребра", () => {
    expect(edgeLabel({ kind: "line", length: 20 })).toBe("Отрезок 20 мм");
    expect(edgeLabel({ kind: "arc", length: 4.7124, radius: 3 })).toBe("Дуга R3 · 4.71 мм");
    expect(edgeLabel({ kind: "circle", length: 12.566, radius: 2 })).toBe("Окружность ⌀4 мм");
    expect(edgeLabel({ kind: "curve", length: 7.256 })).toBe("Кривая 7.26 мм");
  });

  it("группа из одного ребра подписана как ребро", () => {
    expect(edgeGroupLabel([{ kind: "line", length: 14 }])).toBe("Отрезок 14 мм");
  });

  it("цепочка подписана числом рёбер и общей длиной", () => {
    const topo = roundedBoxTopo();
    const [row] = edgeGroupRows(topo, [ROUNDED_LOOP.map((name) => `top-${name}`)]);
    expect(row.label).toBe("Цепочка: 8 рёбер · 74.85 мм");
    expect(row.key).toBe("top-s");
  });

  it("строки идут в порядке групп", () => {
    const rows = edgeGroupRows(roundedBoxTopo(), [["v-s-e"], ["top-ne"]]);
    expect(rows.map((row) => row.label)).toEqual(["Отрезок 10 мм", "Дуга R3 · 4.71 мм"]);
    expect(rows.map((row) => row.edgeIds)).toEqual([["v-s-e"], ["top-ne"]]);
  });
});
