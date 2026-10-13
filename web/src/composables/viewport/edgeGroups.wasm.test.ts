import { beforeAll, describe, expect, it, vi } from "vitest";
import type { BrepTopo } from "@/types/api";
import { buildBody, circle, extrudeRequest, loadWorker, rectangle } from "@/workers/testing/workerHarness";
import { buildEdgeTopology, pickedEdges, type EdgeId } from "./edgeGroups";
import { describeEdge } from "./edgeLabels";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

beforeAll(async () => {
  await loadWorker();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
}, 60_000);

const SIDE = 20;
const HEIGHT = 10;
const RADIUS = 3;

const plate = (featureKey: string, extra = [] as ReturnType<typeof circle>[]) =>
  extrudeRequest([rectangle("r", -SIDE / 2, -SIDE / 2, SIDE / 2, SIDE / 2), ...extra], featureKey, { distance: HEIGHT });

const zRange = (topo: BrepTopo, edgeId: EdgeId) => {
  const flat = topo.edges.find((edge) => edge.edge_id === edgeId)?.polyline ?? [];
  const zs = flat.filter((_, index) => index % 3 === 2);
  return [Math.min(...zs), Math.max(...zs)];
};
const isVertical = (topo: BrepTopo, edgeId: EdgeId) => zRange(topo, edgeId)[1] - zRange(topo, edgeId)[0] > HEIGHT / 2;
const liesAt = (topo: BrepTopo, edgeId: EdgeId, z: number) => zRange(topo, edgeId).every((value) => Math.abs(value - z) < 1e-6);
const chain = (topo: BrepTopo, edgeId: EdgeId) => pickedEdges(buildEdgeTopology(topo), { kind: "edge", edgeId }, true);

describe("группы рёбер на тесселяции реального OCCT/WASM", () => {
  it("у рёбер куба нет касательных продолжений", async () => {
    const topo = (await buildBody(plate("k-eg-cube"), "eg-cube")).mesh!.brep_topo;
    expect(topo.edges).toHaveLength(12);
    for (const edge of topo.edges) expect(chain(topo, edge.edge_id)).toEqual([edge.edge_id]);
  });

  it("после скругления вертикальных рёбер верхний контур — одна петля из 8 рёбер", async () => {
    const cube = (await buildBody(plate("k-eg-box"), "eg-box")).mesh!.brep_topo;
    const vertical = cube.edges.map((edge) => edge.edge_id).filter((id) => isVertical(cube, id));
    expect(vertical).toHaveLength(4);
    const rounded = await buildBody({ kind: "fillet", bodyId: "eg-box", featureKey: "k-eg-fillet", edgeNames: vertical, radius: RADIUS }, "eg-rounded");
    const topo = rounded.mesh!.brep_topo;

    const top = topo.edges.map((edge) => edge.edge_id).filter((id) => liesAt(topo, id, HEIGHT));
    expect(top).toHaveLength(8);
    for (const edgeId of top) expect([...chain(topo, edgeId)].sort()).toEqual([...top].sort());

    const shapes = top.map((id) => describeEdge(topo.edges.find((edge) => edge.edge_id === id)?.polyline));
    expect(shapes.filter((shape) => shape.kind === "arc")).toHaveLength(4);
    expect(shapes.reduce((sum, shape) => sum + shape.length, 0)).toBeCloseTo(4 * (SIDE - 2 * RADIUS) + 2 * Math.PI * RADIUS, 3);

    for (const edgeId of topo.edges.map((edge) => edge.edge_id).filter((id) => isVertical(topo, id))) {
      expect(chain(topo, edgeId)).toEqual([edgeId]);
    }
  });

  it("грань с отверстием отдаёт внешний контур и окружность, цилиндр — без шва", async () => {
    const holed = await buildBody(plate("k-eg-hole", [circle("c", 0, 0, 4)]), "eg-hole");
    const topo = holed.mesh!.brep_topo;
    const topology = buildEdgeTopology(topo);
    const edgesOf = (faceId: EdgeId) => pickedEdges(topology, { kind: "face", faceId }, true);

    const topFace = topo.faces.find((face) => face.edges.length === 5 && face.edges.every((id) => liesAt(topo, id, HEIGHT)))!;
    const kinds = edgesOf(topFace.face_id).map((id) => describeEdge(topo.edges.find((edge) => edge.edge_id === id)?.polyline).kind);
    expect(kinds.sort()).toEqual(["circle", "line", "line", "line", "line"]);

    const cylinder = topo.faces.find((face) => face.edges.length === 3)!;
    const cylinderEdges = edgesOf(cylinder.face_id);
    expect(cylinderEdges).toHaveLength(2);
    expect(cylinderEdges.some((id) => isVertical(topo, id))).toBe(false);
  });
});
