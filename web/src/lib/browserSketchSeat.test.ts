import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { RebuildCache, runRebuild, type RebuildBackend } from "./browserRebuildEngine";
import { browserRebuildPlan, isBodyStep, sketchRebuildRoots, type RebuildDocument } from "./browserRebuildPlan";
import {
  reseatSketchPlane,
  seatFaceIndex,
  sketchFaceRef,
  type SeatSurface,
  type SketchSeatPlacement,
} from "./browserSketchSeat";

const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({
  timestamp: "", label: patch.id, status: "ok", ...patch,
});
const browser = (params: Record<string, unknown>) => ({ ...params, engine: "browser_wasm" });
const top = (height: number): SketchSeatPlacement => ({
  plane: "XY", planeOffset: height, planeBasis: { origin: [0, 0, height], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
});
const flat = (point: [number, number, number], normal: [number, number, number]): SeatSurface => ({ planar: true, point, normal });
const close = (values: number[]) => values.map((value) => expect.closeTo(value, 9));

function document(): RebuildDocument {
  const rectangle = { id: "r", type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 5, y: 5 } };
  return {
    components: {
      s1: { type: "sketch", plane: "XY", plane_offset: 0, entities: [rectangle] },
      s2: { type: "sketch", plane: "XY", plane_offset: 10, plane_basis: top(10).planeBasis, ref_body_id: "b1", ref_face_id: "f-top", entities: [rectangle] },
      s3: { type: "sketch", plane: "XY", plane_offset: 10, plane_basis: top(10).planeBasis, ref_body_id: "b1", ref_face_id: "f-top", entities: [] },
      b1: { type: "body" },
    },
    timeline: [
      entry({ id: "sk1", kind: "sketch", sketch_id: "s1" }),
      entry({ id: "e1", kind: "extrude", sketch_id: "s1", body_id: "b1", params: browser({ distance: 10, operation: "new_body", feature_key: "k1" }) }),
      entry({ id: "sk2", kind: "sketch", sketch_id: "s2", label: "Эскиз 2" }),
      entry({ id: "e2", kind: "extrude", sketch_id: "s2", body_id: "b2", params: browser({ distance: 5, operation: "new_body", feature_key: "k2" }) }),
      entry({ id: "e3", kind: "extrude", sketch_id: "s1", body_id: "b3", params: browser({ distance: 1, operation: "new_body", feature_key: "k3" }) }),
      entry({ id: "f1", kind: "fillet", body_id: "b4", params: browser({ target_body_id: "b2", edge_ids: ["e-a"], radius: 1, feature_key: "kf" }) }),
    ],
  };
}

describe("sketchFaceRef", () => {
  it("считает ассоциативной только ссылку на стабильное имя грани", () => {
    expect(sketchFaceRef({ ref_body_id: "b1", ref_face_id: "f-top" })).toEqual({ bodyId: "b1", faceName: "f-top" });
    expect(sketchFaceRef({ ref_body_id: "b1", ref_face_id: 7 })).toBeNull();
    expect(sketchFaceRef({ ref_body_id: "b1", ref_face_id: "7" })).toBeNull();
    expect(sketchFaceRef({ ref_body_id: null, ref_face_id: "f-top" })).toBeNull();
    expect(sketchFaceRef({ plane: "XY" })).toBeNull();
  });
});

describe("seatFaceIndex", () => {
  it("находит грань по имени", () => {
    expect(seatFaceIndex(["f-side", "f-top"], { faceName: "f-top", label: "Эскиз 2" })).toBe(1);
  });

  it("называет эскиз, чья грань исчезла", () => {
    expect(() => seatFaceIndex(["f-side"], { faceName: "f-top", label: "Эскиз 2" }))
      .toThrow("«Эскиз 2»: грань, на которой построен эскиз, исчезла при пересборке тела");
  });
});

describe("reseatSketchPlane", () => {
  it("поднимает эскиз вместе с гранью и обновляет смещение плоскости", () => {
    expect(reseatSketchPlane(top(10), flat([3, 4, 30], [0, 0, 1]), "Эскиз")).toEqual(top(30));
  });

  it("возвращает прежнюю плоскость, если грань осталась на месте", () => {
    const previous = top(10);

    expect(reseatSketchPlane(previous, flat([7, 1, 10 + 1e-9], [0, 0, 1]), "Эскиз")).toBe(previous);
  });

  it("сохраняет левую тройку эскиза на плоскости XZ и не зеркалит контур", () => {
    const side: SketchSeatPlacement = { plane: "XZ", planeOffset: 0, planeBasis: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, -1, 0] } };

    const moved = reseatSketchPlane(side, flat([0, -4, 0], [0, -1, 0]), "Эскиз");

    expect(moved).toEqual({ plane: "XZ", planeOffset: -4, planeBasis: { origin: [0, -4, 0], u: [1, 0, 0], v: close([0, 0, -1]), n: [0, -1, 0] } });
  });

  it("сажает эскиз на наклонённую грань, сохраняя направление u и ортогональность", () => {
    const tilt = Math.PI / 6;
    const normal: [number, number, number] = [0, -Math.sin(tilt), Math.cos(tilt)];

    const moved = reseatSketchPlane(top(10), flat([0, 0, 10], normal), "Эскиз");
    const basis = moved.planeBasis!;

    expect(moved.plane).toBe("XY");
    expect(moved.planeOffset).toBe(0);
    expect(basis.u).toEqual([1, 0, 0]);
    expect(basis.v).toEqual(close([0, Math.cos(tilt), Math.sin(tilt)]));
    expect(basis.n).toEqual(close(normal));
    expect(basis.origin).toEqual(close([0, 0, 10]));
  });

  it("разворачивает u, когда грань повернулась перпендикулярно прежней оси u", () => {
    const moved = reseatSketchPlane(top(0), flat([5, 0, 0], [1, 0, 0]), "Эскиз");

    expect(moved.plane).toBe("YZ");
    expect(moved.planeOffset).toBe(5);
    expect(moved.planeBasis).toEqual({ origin: [5, 0, 0], u: close([0, 0, -1]), v: [0, 1, 0], n: [1, 0, 0] });
  });

  it("достраивает базис эскизу, сохранённому только плоскостью и смещением", () => {
    const moved = reseatSketchPlane({ plane: "XY", planeOffset: 10, planeBasis: null }, flat([0, 0, 12], [0, 0, 1]), "Эскиз");

    expect(moved).toEqual(top(12));
  });

  it("отказывается сажать эскиз на неплоскую грань", () => {
    expect(() => reseatSketchPlane(top(10), { planar: false }, "Эскиз 2"))
      .toThrow("«Эскиз 2»: грань, на которой построен эскиз, после пересборки тела перестала быть плоской");
  });
});

describe("browserRebuildPlan с эскизами на гранях", () => {
  it("ставит плоскость эскиза после тела-владельца и до операций от эскиза", () => {
    const steps = browserRebuildPlan(document(), "e1", { distance: 30 });

    expect(steps.map((step) => `${step.kind}:${step.entryId}`)).toEqual([
      "extrude:e1", "sketch_plane:sk2", "sketch_plane:s3", "extrude:e2", "fillet:f1",
    ]);
    expect(steps[1]).toEqual({
      kind: "sketch_plane", entryId: "sk2", sketchId: "s2", label: "Эскиз 2", bodyId: "b1", faceName: "f-top", placement: top(10),
    });
    expect(steps.filter(isBodyStep).map((step) => step.sketchId)).toEqual([undefined, "s2", undefined]);
  });

  it("не пересаживает эскиз, если его тело-владелец не пересобирается", () => {
    const steps = browserRebuildPlan(document(), "e2", { distance: 8 });

    expect(steps.map((step) => step.entryId)).toEqual(["e2", "f1"]);
    expect(steps.filter(isBodyStep)[0].sketchId).toBeUndefined();
  });

  it("оставляет эскизы без имени грани на сохранённых координатах", () => {
    const doc = document();
    doc.components.s2 = { ...(doc.components.s2 as object), ref_face_id: 4 };
    doc.components.s3 = { ...(doc.components.s3 as object), ref_body_id: null, ref_face_id: null };

    expect(browserRebuildPlan(doc, "e1", { distance: 30 }).map((step) => step.entryId)).toEqual(["e1"]);
  });

  it("после правки эскиза на грани пересобирает только его операции", () => {
    expect(sketchRebuildRoots(document(), "s2")).toEqual(["e2"]);
  });
});

function fakeBackend(seat: RebuildBackend<string>["seat"]) {
  const built: string[] = [];
  const backend: RebuildBackend<string> = {
    build: (step, lookup) => {
      built.push(step.entryId);
      return `${step.entryId}@${step.request.planeOffset}(${step.inputBodyIds.map(lookup).join(",")})`;
    },
    seat,
    load: (bodyId) => `stored-${bodyId}`,
    revision: () => 0,
    dispose: () => undefined,
  };
  return { backend, built };
}

describe("runRebuild с эскизами на гранях", () => {
  it("считает плоскость по пересобранному владельцу и строит операцию уже от неё", () => {
    const owners: string[] = [];
    const { backend, built } = fakeBackend((step, owner) => {
      owners.push(`${step.faceName}@${owner}`);
      return top(30);
    });

    const outcome = runRebuild(browserRebuildPlan(document(), "e1", { distance: 30 }), backend, new RebuildCache(10, backend.dispose));

    expect(owners).toEqual(["f-top@e1@0()", "f-top@e1@0()"]);
    expect(built).toEqual(["e1", "e2", "f1"]);
    expect(outcome.shapes.get("b2")).toBe("e2@30()");
    expect([...outcome.seats]).toEqual([["s2", top(30)], ["s3", top(30)]]);
  });

  it("берёт операцию из кеша, если плоскость эскиза не изменилась", () => {
    const { backend, built } = fakeBackend((step) => step.placement);
    const cache = new RebuildCache<string>(10, backend.dispose);
    const steps = browserRebuildPlan(document(), "e1", { distance: 30 });

    runRebuild(steps, backend, cache);
    const again = runRebuild(steps, backend, cache);

    expect(built).toEqual(["e1", "e2", "f1"]);
    expect(again.hits).toBe(3);
  });

  it("останавливается на эскизе с пропавшей гранью и не строит операции от него", () => {
    const { backend, built } = fakeBackend((step) => {
      seatFaceIndex(["f-side"], step);
      return step.placement;
    });

    expect(() => runRebuild(browserRebuildPlan(document(), "e1", { distance: 30 }), backend, new RebuildCache(10, backend.dispose)))
      .toThrow("«Эскиз 2»: грань, на которой построен эскиз, исчезла");
    expect(built).toEqual(["e1"]);
  });
});
