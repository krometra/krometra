import { describe, expect, it } from "vitest";
import type { MeasureRef } from "./measure";
import { edgeCandidates, firstVisible, nextPicks, samePick, segmentHit, vertexCandidates, type EdgeTrace } from "./measurePick";

const trace = (edgeId: string, points: [number, number][], hidden: number[] = []): EdgeTrace => ({
  bodyId: "b1",
  edgeId,
  points: points.map(([x, y], index) => ({ world: [x, y, 0], screen: hidden.includes(index) ? null : [x, y] })),
});

const face = (faceId: string): MeasureRef => ({ kind: "face", bodyId: "b1", faceId });

describe("segmentHit", () => {
  it("расстояние до отрезка и параметр ближайшей точки", () => {
    expect(segmentHit([0, 0], [10, 0], [4, 3])).toEqual({ px: 3, t: 0.4 });
    expect(segmentHit([0, 0], [10, 0], [-3, 4])).toEqual({ px: 5, t: 0 });
    expect(segmentHit([2, 2], [2, 2], [2, 5]).px).toBe(3);
  });
});

describe("edgeCandidates", () => {
  it("берёт рёбра в радиусе, ближайшее к курсору первым, с мировой точкой на ребре", () => {
    const candidates = edgeCandidates([trace("far", [[0, 8], [10, 8]]), trace("near", [[0, 2], [10, 2]])], [5, 0], 10);
    expect(candidates.map((candidate) => candidate.target)).toEqual([
      { kind: "edge", bodyId: "b1", edgeId: "near" },
      { kind: "edge", bodyId: "b1", edgeId: "far" },
    ]);
    expect(candidates[0].world).toEqual([5, 2, 0]);
  });

  it("пропускает отрезки с точкой за камерой и рёбра вне радиуса", () => {
    expect(edgeCandidates([trace("behind", [[0, 0], [10, 0]], [1])], [5, 0], 10)).toEqual([]);
    expect(edgeCandidates([trace("away", [[0, 50], [10, 50]])], [5, 0], 10)).toEqual([]);
  });
});

describe("vertexCandidates", () => {
  it("вершины — концы рёбер в радиусе", () => {
    const [vertex] = vertexCandidates([trace("e", [[0, 0], [5, 0], [20, 0]])], [18, 1], 5);
    expect(vertex.target).toEqual({ kind: "vertex", bodyId: "b1", point: [20, 0, 0] });
    expect(vertexCandidates([trace("e", [[0, 0], [5, 0], [20, 0]])], [5, 0], 3)).toEqual([]);
  });
});

describe("firstVisible", () => {
  it("пропускает заслонённые кандидаты, но смотрит не дальше лимита", () => {
    const candidates = [1, 2, 3].map((x) => ({ target: x, world: [x, 0, 0] as [number, number, number], px: x }));
    expect(firstVisible(candidates, (world) => world[0] > 1)?.target).toBe(2);
    expect(firstVisible(candidates, (world) => world[0] > 2, 2)).toBeNull();
  });
});

describe("nextPicks", () => {
  it("добавляет до двух объектов, третий начинает новое измерение", () => {
    const one = nextPicks([], face("a"));
    const two = nextPicks(one, face("b"));
    expect(two).toEqual([face("a"), face("b")]);
    expect(nextPicks(two, face("c"))).toEqual([face("c")]);
  });

  it("повторный клик снимает объект, клик мимо очищает выбор", () => {
    expect(nextPicks([face("a"), face("b")], face("a"))).toEqual([face("b")]);
    expect(nextPicks([face("a")], null)).toEqual([]);
  });

  it("вершины сравниваются по координатам, тела — по идентификатору", () => {
    expect(samePick({ kind: "vertex", bodyId: "b1", point: [1, 2, 3] }, { kind: "vertex", bodyId: "b1", point: [1, 2, 3.0000001] })).toBe(true);
    expect(samePick({ kind: "body", bodyId: "b1" }, { kind: "body", bodyId: "b2" })).toBe(false);
    expect(samePick({ kind: "body", bodyId: "b1" }, face("a"))).toBe(false);
  });
});
