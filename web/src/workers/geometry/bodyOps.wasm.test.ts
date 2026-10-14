import { beforeAll, describe, expect, it, vi } from "vitest";
import { measureVolume, setOC } from "replicad";
import { extrudeNamed } from "./extrude";
import { bodyShape, namedBodyShape, publishNamed, retainShape } from "./shapes";
import { sectionBodies } from "./section";
import { transformNamed } from "./transform";
import { sectionContours } from "@/lib/sectionContours";

vi.mock("./occt", () => ({ initOcct: () => Promise.resolve() }));

beforeAll(async () => {
  const { default: initOpenCascade } = await import("replicad-opencascadejs");
  const wasmPath = decodeURIComponent(new URL("../../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  setOC(await initOpenCascade({ locateFile: () => wasmPath }));
}, 60_000);

async function box() {
  const result = await publishNamed(() => extrudeNamed({
    id: 1, kind: "extrude", entities: [{ id: "sq", type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 10, y: 4 } }],
    plane: "XY", planeOffset: 0, planeBasis: null, distance: 2, direction: "one_side", extentType: "distance",
    backDistance: 0, offset: 0, operation: "new_body", targetBodyId: null, upToBodyId: null, upToFaceId: null,
    upToFacePoints: null, featureKey: "k-box",
  }, namedBodyShape));
  retainShape(result.shapeHandle, "box");
  return namedBodyShape("box");
}

describe("перемещение тела на реальном OCCT/WASM", () => {
  it("сдвигает и поворачивает тело, сохраняя объём и имена граней", async () => {
    const source = await box();
    const moved = transformNamed(
      { id: 2, kind: "transform", bodyId: "box", featureKey: "k-move", translate: [0, 0, 5], rotate: { axis: [0, 0, 1], angle: 90, origin: [0, 0, 0] } },
      namedBodyShape,
    );
    expect(measureVolume(moved.shape)).toBeCloseTo(80, 6);
    const bounds = moved.shape.boundingBox.bounds;
    expect(bounds[0][0]).toBeCloseTo(-4, 6);
    expect(bounds[1][1]).toBeCloseTo(10, 6);
    expect(bounds[0][2]).toBeCloseTo(5, 6);
    expect([...moved.naming.faces].sort()).toEqual([...source.naming.faces].sort());
    expect(measureVolume(bodyShape("box"))).toBeCloseTo(80, 6);
    moved.shape.delete();
  });
});

describe("сечение тела на реальном OCCT/WASM", () => {
  it("режет коробку горизонтальной плоскостью в один прямоугольный контур", async () => {
    await box();
    const [section] = await sectionBodies({ id: 3, kind: "section", bodyIds: ["box"], origin: [0, 0, 1], normal: [0, 0, 1] });
    const contours = sectionContours(section.polylines, { origin: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] });
    expect(contours).toHaveLength(1);
    expect(contours[0].closed).toBe(true);
    expect(contours[0].area).toBeCloseTo(40, 3);
    expect(contours[0].bbox).toEqual({ min: [0, 0], max: [10, 4] });
  });

  it("плоскость мимо тела даёт пустое сечение", async () => {
    await box();
    const [section] = await sectionBodies({ id: 4, kind: "section", bodyIds: ["box"], origin: [0, 0, 50], normal: [0, 0, 1] });
    expect(section.polylines).toEqual([]);
  });
});
