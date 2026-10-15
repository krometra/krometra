import { beforeAll, describe, expect, it, vi } from "vitest";
import { setOC } from "replicad";
import type { SketchEntity } from "@/types/api";
import type { MeasuredBody, MeasuredEdge, MeasuredFace, MeasuredVertex, MeasureRef } from "@/lib/measure";
import { extrudeNamed } from "./extrude";
import { measureShapes } from "./measure";
import { withTopology } from "./naming";
import { namedBodyShape, publishNamed, retainShape } from "./shapes";

vi.mock("./occt", () => ({ initOcct: () => Promise.resolve() }));

beforeAll(async () => {
  const { default: initOpenCascade } = await import("replicad-opencascadejs");
  const wasmPath = decodeURIComponent(new URL("../../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  setOC(await initOpenCascade({ locateFile: () => wasmPath }));
  await body("box", { id: "sq", type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 10, y: 4 } }, 2);
  await body("rod", { id: "c1", type: "circle", center: { x: 20, y: 0 }, radius: 3 }, 5);
  await body("pin", { id: "c2", type: "circle", center: { x: 20, y: 12 }, radius: 1 }, 5);
}, 60_000);

let nextId = 1;
async function body(bodyId: string, entity: SketchEntity, distance: number) {
  const result = await publishNamed(() => extrudeNamed({
    id: nextId++, kind: "extrude", entities: [entity], plane: "XY", planeOffset: 0, planeBasis: null,
    distance, direction: "one_side", extentType: "distance", backDistance: 0, offset: 0, operation: "new_body",
    targetBodyId: null, upToBodyId: null, upToFaceId: null, upToFacePoints: null, featureKey: `k-${bodyId}`,
  }, namedBodyShape));
  retainShape(result.shapeHandle, bodyId);
}

type Fingerprint = [number, number, number, number];

function faceWhere(bodyId: string, match: (fingerprint: Fingerprint) => boolean): MeasureRef {
  const named = namedBodyShape(bodyId);
  const index = withTopology(named.shape, (topology) => topology.snapshot.faces.findIndex((print) => match(print as Fingerprint)));
  return { kind: "face", bodyId, faceId: named.naming.faces[index] };
}

function edgeWhere(bodyId: string, match: (fingerprint: Fingerprint) => boolean): MeasureRef {
  const named = namedBodyShape(bodyId);
  const index = withTopology(named.shape, (topology) => topology.snapshot.edges.findIndex((edge) => match(edge.fingerprint as Fingerprint)));
  return { kind: "edge", bodyId, edgeId: named.naming.edges[index] };
}

const near = (value: number, target: number) => Math.abs(value - target) < 1e-6;
const boxTop = () => faceWhere("box", ([, , z, area]) => near(z, 2) && near(area, 40));
const boxBottom = () => faceWhere("box", ([, , z, area]) => near(z, 0) && near(area, 40));
const boxSide = () => faceWhere("box", ([x, , , area]) => near(x, 10) && near(area, 8));
const rodSide = () => faceWhere("rod", ([, , z, area]) => near(z, 2.5) && area > 50);
const pinSide = () => faceWhere("pin", ([, , z, area]) => near(z, 2.5) && area > 20);

describe("измерения на реальном OCCT/WASM", () => {
  it("тело: объём, площадь, центр масс и габарит", () => {
    const [box] = measureShapes([{ kind: "body", bodyId: "box" }], namedBodyShape).items as MeasuredBody[];
    expect(box.volume).toBeCloseTo(80, 6);
    expect(box.area).toBeCloseTo(136, 6);
    box.centerOfMass.forEach((value, axis) => expect(value).toBeCloseTo([5, 2, 1][axis], 6));
    expect(box.bbox.max[0] - box.bbox.min[0]).toBeCloseTo(10, 6);
    expect(box.bbox.max[2] - box.bbox.min[2]).toBeCloseTo(2, 6);
  });

  it("плоская грань: площадь и внешняя нормаль", () => {
    const [top] = measureShapes([boxTop()], namedBodyShape).items as MeasuredFace[];
    expect(top.surface).toBe("plane");
    expect(top.area).toBeCloseTo(40, 6);
    expect(top.normal![2]).toBeCloseTo(1, 6);
  });

  it("цилиндрическая грань и круговое ребро: радиус, центр и ось", () => {
    const [side] = measureShapes([rodSide()], namedBodyShape).items as MeasuredFace[];
    expect(side.surface).toBe("cylinder");
    expect(side.radius).toBeCloseTo(3, 6);
    expect(Math.abs(side.axis!.direction[2])).toBeCloseTo(1, 6);

    const rim = edgeWhere("rod", ([, , z, length]) => near(z, 5) && near(length, 6 * Math.PI));
    const [circle] = measureShapes([rim], namedBodyShape).items as MeasuredEdge[];
    expect(circle.curve).toBe("circle");
    expect(circle.closed).toBe(true);
    expect(circle.radius).toBeCloseTo(3, 6);
    expect(circle.center).toEqual([expect.closeTo(20, 6), expect.closeTo(0, 6), expect.closeTo(5, 6)]);
  });

  it("прямое ребро: длина и направление", () => {
    const long = edgeWhere("box", ([, y, z, length]) => near(y, 0) && near(z, 2) && near(length, 10));
    const [edge] = measureShapes([long], namedBodyShape).items as MeasuredEdge[];
    expect(edge.curve).toBe("line");
    expect(edge.length).toBeCloseTo(10, 6);
    expect(Math.abs(edge.direction![0])).toBeCloseTo(1, 6);
  });

  it("между параллельными гранями: расстояние, отрезок и нулевой угол", () => {
    const { pair } = measureShapes([boxTop(), boxBottom()], namedBodyShape);
    expect(pair!.distance).toBeCloseTo(2, 6);
    expect(pair!.points[0][2]).toBeCloseTo(2, 6);
    expect(pair!.points[1][2]).toBeCloseTo(0, 6);
    expect(pair!.delta[2]).toBeCloseTo(-2, 6);
    expect(pair!.angle).toBeCloseTo(0, 6);
  });

  it("смежные грани касаются и стоят под прямым углом", () => {
    const { pair } = measureShapes([boxTop(), boxSide()], namedBodyShape);
    expect(pair!.distance).toBeCloseTo(0, 6);
    expect(pair!.angle).toBeCloseTo(90, 6);
  });

  it("вершина прилипает к ближайшей вершине тела", () => {
    const { items, pair } = measureShapes([
      { kind: "vertex", bodyId: "box", point: [10.004, 4, 2] },
      { kind: "vertex", bodyId: "box", point: [0, 0, 0] },
    ], namedBodyShape);
    expect((items[0] as MeasuredVertex).point).toEqual([10, 4, 2]);
    expect(pair!.distance).toBeCloseTo(Math.hypot(10, 4, 2), 6);
  });

  it("между телами и межосевое двух цилиндров", () => {
    const bodies = measureShapes([{ kind: "body", bodyId: "box" }, { kind: "body", bodyId: "rod" }], namedBodyShape);
    expect(bodies.pair!.distance).toBeCloseTo(7, 6);

    const holes = measureShapes([rodSide(), pinSide()], namedBodyShape);
    expect(holes.pair!.axisDistance).toBeCloseTo(12, 6);
    expect(holes.pair!.distance).toBeCloseTo(8, 6);
    expect(holes.pair!.angle).toBeCloseTo(0, 6);
  });

  it("исчезнувшая грань и пустой выбор дают понятную ошибку", () => {
    expect(() => measureShapes([{ kind: "face", bodyId: "box", faceId: "нет-такой" }], namedBodyShape)).toThrow(/больше не существует/);
    expect(() => measureShapes([], namedBodyShape)).toThrow(/один или два объекта/);
  });
});
