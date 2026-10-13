import { describe, expect, it } from "vitest";
import {
  buildEdgeTopology,
  endTangent,
  pickedEdges,
  selectionGroups,
  togglePicked,
  TANGENT_CHAIN_TOLERANCE_DEG,
  type EdgeId,
} from "./edgeGroups";
import type { Vec3 } from "@/lib/threadGeometry";
import { arcEdge, cubeTopo, lineEdge, plateWithHoleTopo, ROUNDED_LOOP, roundedBoxTopo, topoOf } from "./edgeFixtures";

const sorted = (ids: EdgeId[]) => [...ids].map(String).sort();
const chainOf = (topo: ReturnType<typeof topoOf>, edgeId: string, toleranceDeg?: number) =>
  sorted(pickedEdges(buildEdgeTopology(topo, toleranceDeg), { kind: "edge", edgeId }, true));

function kinkedPair(kinkDeg: number) {
  const angle = (kinkDeg * Math.PI) / 180;
  return topoOf([
    lineEdge("first", [0, 0, 0], [10, 0, 0]),
    lineEdge("second", [10, 0, 0], [10 + 10 * Math.cos(angle), 10 * Math.sin(angle), 0]),
  ]);
}

describe("endTangent", () => {
  it("у отрезка совпадает с его направлением", () => {
    expect(endTangent([0, 0, 0], [2, 0, 0], [5, 0, 0])).toEqual([1, 0, 0]);
  });

  it("у дуги даёт касательную, а не хорду первого сегмента", () => {
    const point = (deg: number): Vec3 => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 0];
    const tangent = endTangent(point(0), point(25), point(50))!;
    expect(tangent[0]).toBeCloseTo(0, 9);
    expect(tangent[1]).toBeCloseTo(1, 9);
  });

  it("по двум точкам возвращает хорду", () => {
    expect(endTangent([0, 0, 0], [0, 3, 0])).toEqual([0, 1, 0]);
  });
});

describe("касательная цепочка", () => {
  it("у ребра куба нет касательных продолжений", () => {
    const topo = cubeTopo();
    for (const edge of topo.edges) {
      expect(chainOf(topo, String(edge.edge_id))).toEqual([edge.edge_id]);
    }
  });

  it("на скруглённой коробке замыкается в петлю из отрезков и дуг", () => {
    const topo = roundedBoxTopo();
    const loop = sorted(ROUNDED_LOOP.map((name) => `top-${name}`));
    expect(chainOf(topo, "top-s")).toEqual(loop);
    expect(chainOf(topo, "top-nw")).toEqual(loop);
  });

  it("петля не захватывает вертикальные рёбра и нижний контур", () => {
    const topo = roundedBoxTopo();
    expect(chainOf(topo, "v-s-e")).toEqual(["v-s-e"]);
    expect(chainOf(topo, "bottom-e")).toEqual(sorted(ROUNDED_LOOP.map((name) => `bottom-${name}`)));
  });

  it("держится на грубой тесселяции, где хорда уходит от касательной на 11°", () => {
    const topo = roundedBoxTopo(4);
    expect(chainOf(topo, "top-e")).toHaveLength(8);
  });

  it("не уходит через острый угол", () => {
    const topo = topoOf([
      lineEdge("in", [0, 0, 0], [10, 0, 0]),
      arcEdge("bend", [10, 5, 0], 5, -90, 0),
      lineEdge("out", [15, 5, 0], [15, 15, 0]),
      lineEdge("corner", [15, 15, 0], [5, 20, 0]),
    ]);
    expect(chainOf(topo, "in")).toEqual(["bend", "in", "out"]);
    expect(chainOf(topo, "corner")).toEqual(["corner"]);
  });

  it("не продолжает дугу отрезком, который подходит к ней под углом", () => {
    const topo = topoOf([
      arcEdge("bend", [0, 5, 0], 5, -90, 0),
      lineEdge("skewed", [5, 5, 0], [5 + 10 * Math.sin(0.2), 5 + 10 * Math.cos(0.2), 0]),
    ]);
    expect(chainOf(topo, "bend")).toEqual(["bend"]);
  });

  it("излом в пределах допуска считается продолжением, за его пределами — нет", () => {
    expect(chainOf(kinkedPair(TANGENT_CHAIN_TOLERANCE_DEG - 1), "first")).toEqual(["first", "second"]);
    expect(chainOf(kinkedPair(TANGENT_CHAIN_TOLERANCE_DEG + 1), "first")).toEqual(["first"]);
    expect(chainOf(kinkedPair(2), "first", 1)).toEqual(["first"]);
  });

  it("разворот назад в общей вершине продолжением не считается", () => {
    const topo = topoOf([
      lineEdge("there", [0, 0, 0], [10, 0, 0]),
      lineEdge("back", [10, 0, 0], [0, 0.001, 0]),
    ]);
    expect(chainOf(topo, "there")).toEqual(["there"]);
  });

  it("не зависит от того, сегментами или подряд записана полилиния", () => {
    const paired = roundedBoxTopo();
    const sequential = topoOf(paired.edges.map((edge) => {
      const flat = edge.polyline ?? [];
      const points = [flat.slice(0, 3)];
      for (let i = 3; i < flat.length; i += 6) points.push(flat.slice(i, i + 3));
      return { ...edge, polyline: points.flat() };
    }));
    expect(chainOf(sequential, "top-s")).toEqual(chainOf(paired, "top-s"));
  });

  it("ребро без полилинии остаётся само по себе", () => {
    const topo = topoOf([{ edge_id: "bare", vertices: [] }, lineEdge("line", [0, 0, 0], [1, 0, 0])]);
    expect(chainOf(topo, "bare")).toEqual(["bare"]);
  });

  it("с выключенной цепочкой клик берёт одно ребро", () => {
    const topology = buildEdgeTopology(roundedBoxTopo());
    expect(pickedEdges(topology, { kind: "edge", edgeId: "top-s" }, false)).toEqual(["top-s"]);
  });
});

describe("рёбра грани", () => {
  it("грань куба отдаёт свои четыре ребра", () => {
    const topology = buildEdgeTopology(cubeTopo());
    expect(pickedEdges(topology, { kind: "face", faceId: "top" }, true)).toEqual(["t0", "t1", "t2", "t3"]);
  });

  it("грань с отверстием отдаёт внешний и внутренний контуры", () => {
    const topology = buildEdgeTopology(plateWithHoleTopo());
    expect(pickedEdges(topology, { kind: "face", faceId: "top" }, true)).toEqual(["t0", "t1", "t2", "t3", "hole-top"]);
  });

  it("шов цилиндрической грани в её рёбра не входит", () => {
    const topology = buildEdgeTopology(plateWithHoleTopo());
    expect(pickedEdges(topology, { kind: "face", faceId: "hole" }, true)).toEqual(["hole-top", "hole-bottom"]);
  });

  it("цепочка на набор рёбер грани не влияет", () => {
    const topology = buildEdgeTopology(roundedBoxTopo());
    const pick = { kind: "face", faceId: "south" } as const;
    expect(pickedEdges(topology, pick, true)).toEqual(pickedEdges(topology, pick, false));
    expect(pickedEdges(topology, pick, true)).toEqual(["top-s", "bottom-s", "v-s-w", "v-s-e"]);
  });

  it("неизвестная грань не даёт рёбер", () => {
    expect(pickedEdges(buildEdgeTopology(cubeTopo()), { kind: "face", faceId: "nope" }, true)).toEqual([]);
  });
});

describe("переключение выбора", () => {
  const topology = buildEdgeTopology(roundedBoxTopo());
  const topLoop = ROUNDED_LOOP.map((name) => `top-${name}`);
  const click = (selected: EdgeId[], pick: Parameters<typeof togglePicked>[2], chain: boolean) =>
    togglePicked(selected, pickedEdges(topology, pick, chain), pick);

  it("клик по ребру добавляет всю цепочку, повторный — снимает её", () => {
    const once = click([], { kind: "edge", edgeId: "top-s" }, true);
    expect(sorted(once)).toEqual(sorted(topLoop));
    expect(click(once, { kind: "edge", edgeId: "top-ne" }, true)).toEqual([]);
  });

  it("без цепочки повторный клик снимает только это ребро", () => {
    const loop = click([], { kind: "edge", edgeId: "top-s" }, true);
    const without = click(loop, { kind: "edge", edgeId: "top-ne" }, false);
    expect(sorted(without)).toEqual(sorted(topLoop.filter((id) => id !== "top-ne")));
  });

  it("клик по невыбранному ребру дополняет частично выбранную цепочку", () => {
    const completed = click(["top-s", "v-s-e"], { kind: "edge", edgeId: "top-n" }, true);
    expect(sorted(completed)).toEqual(sorted([...topLoop, "v-s-e"]));
  });

  it("клик по выбранному ребру снимает цепочку и не трогает остальное", () => {
    const left = click([...topLoop, "v-s-e"], { kind: "edge", edgeId: "top-w" }, true);
    expect(left).toEqual(["v-s-e"]);
  });

  it("клик по грани добавляет недостающие рёбра, повторный — снимает все", () => {
    const face = { kind: "face", faceId: "south" } as const;
    const added = click(["top-s"], face, true);
    expect(added).toEqual(["top-s", "bottom-s", "v-s-w", "v-s-e"]);
    expect(click(added, face, true)).toEqual([]);
  });

  it("порядок выбора сохраняется", () => {
    const first = click([], { kind: "edge", edgeId: "v-s-e" }, false);
    expect(click(first, { kind: "edge", edgeId: "v-n-w" }, false)).toEqual(["v-s-e", "v-n-w"]);
  });
});

describe("строки списка выбранного", () => {
  const topology = buildEdgeTopology(roundedBoxTopo());

  it("с цепочкой рёбра одной цепочки собираются в одну строку", () => {
    const groups = selectionGroups(topology, ["top-s", "v-s-e", "top-se", "bottom-n"], true);
    expect(groups).toEqual([["top-s", "top-se"], ["v-s-e"], ["bottom-n"]]);
  });

  it("без цепочки каждое ребро — отдельная строка", () => {
    expect(selectionGroups(topology, ["top-s", "top-se"], false)).toEqual([["top-s"], ["top-se"]]);
  });

  it("снятие строки и клик по ребру сцены дают один результат", () => {
    const selected = ["top-s", "top-se", "v-s-e"];
    const [row] = selectionGroups(topology, selected, true);
    const fromList = { kind: "edge", edgeId: row[0] } as const;
    const fromScene = { kind: "edge", edgeId: "top-se" } as const;
    expect(togglePicked(selected, pickedEdges(topology, fromList, true), fromList))
      .toEqual(togglePicked(selected, pickedEdges(topology, fromScene, true), fromScene));
  });
});
