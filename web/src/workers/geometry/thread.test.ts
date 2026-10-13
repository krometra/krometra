import initOpenCascade from "replicad-opencascadejs";
import { drawCircle, makeBox, makeCylinder, measureVolume, setOC } from "replicad";
import type { Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { ThreadError, type ThreadOptions } from "@/lib/threadGeometry";
import { namedFresh, type NamedShape } from "./naming";
import { describeThreadCylinder, findThreadFace, threadBody } from "./thread";

const M10: ThreadOptions = { pitch: 1.5, depth: null, length: 15, offset: 2, crestRatio: 0, starts: 1, rightHanded: true };

function cylindricalFace(shape: Shape3D) {
  const face = shape.faces.find((candidate) => candidate.geomType === "CYLINDRE");
  if (!face) throw new Error("нет цилиндрической грани");
  return face;
}

function cylindricalFaceName(named: NamedShape) {
  return named.naming.faces[named.shape.faces.findIndex((candidate) => candidate.geomType === "CYLINDRE")];
}

function expectedGrooveVolume(radius: number, depth: number, length: number, external: boolean) {
  const meanRadius = external ? radius - depth / 3 : radius + depth / 3;
  return Math.PI * meanRadius * depth * length;
}

describe("резьба на реальном OCCT/WASM", () => {
  beforeAll(async () => {
    setOC(await initOpenCascade());
  }, 60_000);

  it("разворачивает ось выдавленного вверх цилиндра и определяет стержень", () => {
    const shape = drawCircle(5).sketchOnPlane("XY").extrude(20) as Shape3D;
    const cylinder = describeThreadCylinder(cylindricalFace(shape));

    expect(cylinder.radius).toBeCloseTo(5);
    expect(cylinder.direction[2]).toBeCloseTo(1);
    expect(cylinder.start).toBeCloseTo(0);
    expect(cylinder.length).toBeCloseTo(20);
    expect(cylinder.external).toBe(true);
  });

  it("определяет стенку отверстия как внутреннюю резьбу", () => {
    const shape = makeBox([-10, -10, 0], [10, 10, 20]).cut(makeCylinder(4, 20)) as Shape3D;

    expect(describeThreadCylinder(cylindricalFace(shape)).external).toBe(false);
  });

  it("находит грань по стабильному имени", () => {
    const named = namedFresh(makeCylinder(5, 20) as Shape3D, "k-cyl");
    const face = findThreadFace(named, { faceId: cylindricalFaceName(named), facePoints: [] });

    expect(face.geomType).toBe("CYLINDRE");
  });

  it("находит грань по точкам mesh, если имя неизвестно", () => {
    const named = namedFresh(makeCylinder(5, 20) as Shape3D, "k-cyl");
    const face = findThreadFace(named, { faceId: "stale", facePoints: [[5, 0, 3], [0, -5, 12]] });

    expect(face.geomType).toBe("CYLINDRE");
  });

  it("отказывает на плоской грани", () => {
    const named = namedFresh(makeCylinder(5, 20) as Shape3D, "k-cyl");
    const plane = named.naming.faces[named.shape.faces.findIndex((face) => face.geomType === "PLANE")];

    expect(() => threadBody(named, { faceId: plane, facePoints: [] }, M10, "k-t")).toThrow(ThreadError);
  });

  it("нарезает внешнюю M10×1.5 с объёмом канавки как у профиля", () => {
    const named = namedFresh(makeCylinder(5, 20) as Shape3D, "k-cyl");
    const before = measureVolume(named.shape);
    const { named: threaded, plan } = threadBody(named, { faceId: cylindricalFaceName(named), facePoints: [] }, M10, "k-t");
    const result = threaded.shape;
    const removed = before - measureVolume(result);

    expect(plan.depth).toBeCloseTo(0.9195);
    expect(removed / expectedGrooveVolume(5, plan.depth, 15, true)).toBeGreaterThan(0.85);
    expect(removed / expectedGrooveVolume(5, plan.depth, 15, true)).toBeLessThan(1.15);
    const box = result.boundingBox;
    expect(box.bounds[0][2]).toBeCloseTo(0);
    expect(box.bounds[1][2]).toBeCloseTo(20);
  }, 60_000);

  it("нарезает внутреннюю двухзаходную резьбу в отверстии", () => {
    const named = namedFresh(makeBox([-12, -12, 0], [12, 12, 12]).cut(makeCylinder(6, 12)) as Shape3D, "k-box");
    const before = measureVolume(named.shape);
    const options = { ...M10, pitch: 2, length: null, offset: 0, starts: 2, crestRatio: 0.3 };
    const { named: result, cylinder } = threadBody(named, { faceId: cylindricalFaceName(named), facePoints: [] }, options, "k-t");

    expect(cylinder.external).toBe(false);
    expect(measureVolume(result.shape)).toBeLessThan(before);
    expect(result.naming.faces).toEqual(expect.arrayContaining(named.naming.faces.filter((name) => name !== cylindricalFaceName(named))));
  }, 60_000);
});
