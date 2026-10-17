import { beforeAll, describe, expect, it, vi } from "vitest";
import { measureVolume, setOC } from "replicad";
import { generatedFaceName } from "@/lib/browserNaming";
import { sketchRegions } from "@/lib/sketchRegions";
import type { SketchEntity } from "@/types/api";
import type { ExtrudeRequest, RevolveRequest } from "./types";
import { extrudeNamed } from "./extrude";
import { revolveNamed } from "./revolve";
import { namedBodyShape } from "./shapes";

vi.mock("./occt", () => ({ initOcct: () => Promise.resolve() }));

beforeAll(async () => {
  const { default: initOpenCascade } = await import("replicad-opencascadejs");
  const wasmPath = decodeURIComponent(new URL("../../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  setOC(await initOpenCascade({ locateFile: () => wasmPath }));
}, 60_000);

const circleAndStrip: SketchEntity[] = [
  { id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 10 },
  { id: "r", type: "rectangle", corner1: { x: 0, y: -5 }, corner2: { x: 20, y: 5 } },
];
const insideBoth = 5 * Math.sqrt(75) + (100 * Math.PI) / 6;

function regionKey(entities: SketchEntity[], area: number): string {
  const region = sketchRegions(entities).find((candidate) => Math.abs(candidate.area - area) < 1e-6);
  if (!region) throw new Error(`нет региона площадью ${area}`);
  return region.key;
}

function extrude(entities: SketchEntity[], profileRegions: string[] | null) {
  return extrudeNamed({
    id: 1, kind: "extrude", entities, plane: "XY", planeOffset: 0, planeBasis: null,
    distance: 5, direction: "one_side", extentType: "distance", backDistance: 0, offset: 0,
    operation: "new_body", targetBodyId: null, upToBodyId: null, upToFaceId: null, upToFacePoints: null,
    profileRegions, featureKey: "k-region",
  } satisfies ExtrudeRequest, namedBodyShape);
}

function volumeOf(named: ReturnType<typeof extrude>): number {
  try {
    return measureVolume(named.shape);
  } finally {
    named.shape.delete();
  }
}

describe("выдавливание выбранных регионов на реальном OCCT/WASM", () => {
  it("выдавливает только область внутри круга и прямоугольника", () => {
    expect(volumeOf(extrude(circleAndStrip, [regionKey(circleAndStrip, insideBoth)]))).toBeCloseTo(insideBoth * 5, 3);
  });

  it("выдавливает остаток прямоугольника за кругом", () => {
    expect(volumeOf(extrude(circleAndStrip, [regionKey(circleAndStrip, 200 - insideBoth)]))).toBeCloseTo((200 - insideBoth) * 5, 3);
  });

  it("сливает смежные регионы в одну грань: снова целый цилиндр", () => {
    const keys = [regionKey(circleAndStrip, insideBoth), regionKey(circleAndStrip, 100 * Math.PI - insideBoth)];
    const named = extrude(circleAndStrip, keys);
    try {
      expect(measureVolume(named.shape)).toBeCloseTo(500 * Math.PI, 3);
      expect(named.shape.faces.length).toBe(4);
    } finally {
      named.shape.delete();
    }
  });

  it("без выбора выдавливает эскиз как раньше", () => {
    const plate: SketchEntity[] = [
      { id: "p", type: "rectangle", corner1: { x: -10, y: -10 }, corner2: { x: 10, y: 10 } },
      { id: "h", type: "circle", center: { x: 0, y: 0 }, radius: 3 },
    ];

    expect(volumeOf(extrude(plate, null))).toBeCloseTo((400 - 9 * Math.PI) * 5, 3);
    expect(volumeOf(extrude(plate, [regionKey(plate, 9 * Math.PI)]))).toBeCloseTo(45 * Math.PI, 3);
  });

  it("называет боковые грани по кускам рёбер-источников", () => {
    const split: SketchEntity[] = [
      { id: "r", type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 10, y: 10 } },
      { id: "l", type: "line", start: { x: 4, y: -2 }, end: { x: 4, y: 12 } },
    ];
    const named = extrude(split, [regionKey(split, 40)]);
    try {
      expect(named.naming.faces).toContain(generatedFaceName("k-region", "side:l:1"));
      expect(named.naming.faces).toContain(generatedFaceName("k-region", "side:r.3"));
    } finally {
      named.shape.delete();
    }
  });

  it("объясняет, что регион пропал после правки эскиза", () => {
    expect(() => extrude(circleAndStrip, ["rgone"])).toThrow("Выберите профиль заново");
  });

  it("вращает только выбранный регион", () => {
    const ring: SketchEntity[] = [
      { id: "r", type: "rectangle", corner1: { x: 5, y: 0 }, corner2: { x: 10, y: 10 } },
      { id: "cut", type: "line", start: { x: 5, y: 5 }, end: { x: 10, y: 5 } },
    ];
    const top = sketchRegions(ring).find((region) => region.point.y > 5)!;
    const named = revolveNamed({
      id: 2, kind: "revolve", entities: ring, plane: "XY", planeOffset: 0, planeBasis: null,
      axisOrigin: { x: 0, y: 0 }, axis: "y", angle: 360, direction: "one_side",
      profileRegions: [top.key], featureKey: "k-revolve",
    } satisfies RevolveRequest);
    try {
      expect(measureVolume(named.shape)).toBeCloseTo(Math.PI * (100 - 25) * 5, 2);
    } finally {
      named.shape.delete();
    }
  });
});
