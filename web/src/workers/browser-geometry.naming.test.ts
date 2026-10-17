import { beforeAll, describe, expect, it, vi } from "vitest";
import { generatedFaceName } from "@/lib/browserNaming";
import { buildBody, circle, edgeNames, extrudeRequest, faceNames, loadWorker, rectangle, send, sendOk } from "./testing/workerHarness";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const box = [rectangle("r1", 0, 0, 20, 10)];

beforeAll(async () => {
  await loadWorker();
}, 60_000);

describe("persistent naming в browser worker (реальный OCCT/WASM)", () => {
  it("выдавливание отдаёт стабильные имена граней и рёбер вместо физических индексов", async () => {
    const reply = await sendOk(extrudeRequest(box, "k-box"));
    const faces = faceNames(reply);

    expect(faces).toHaveLength(6);
    expect(faces.every((name) => name.startsWith("f-"))).toBe(true);
    expect(new Set(faces).size).toBe(6);
    expect(faces).toEqual(expect.arrayContaining([
      generatedFaceName("k-box", "side:r1.0"),
      generatedFaceName("k-box", "side:r1.1"),
      generatedFaceName("k-box", "side:r1.2"),
      generatedFaceName("k-box", "side:r1.3"),
      generatedFaceName("k-box", "start:r1.0"),
      generatedFaceName("k-box", "end:r1.0"),
    ]));
    expect(new Set(edgeNames(reply)).size).toBe(12);
    expect(reply.mesh?.brep_topo.edges.every((edge) => (edge.polyline?.length ?? 0) >= 6)).toBe(true);
    expect(reply.naming?.faces.map((face) => face.name).sort()).toEqual([...faces].sort());
    await sendOk({ kind: "discard", shapeHandle: reply.shapeHandle });
  });

  it("имена не зависят от параметров операции", async () => {
    const short = await sendOk(extrudeRequest(box, "k-param", { distance: 5 }));
    const long = await sendOk(extrudeRequest(box, "k-param", { distance: 40, direction: "symmetric" }));

    expect(faceNames(long).sort()).toEqual(faceNames(short).sort());
    expect(edgeNames(long).sort()).toEqual(edgeNames(short).sort());
  });

  it("приклеивание сохраняет имена граней цели и называет грани инструмента", async () => {
    const base = await buildBody(extrudeRequest(box, "k-base"), "body-base");
    const joined = await sendOk(extrudeRequest([circle("c1", 10, 5, 3)], "k-boss", {
      planeOffset: 10,
      operation: "join",
      targetBodyId: "body-base",
    }));
    const faces = faceNames(joined);

    expect(faces).toEqual(expect.arrayContaining(faceNames(base)));
    expect(faces).toContain(generatedFaceName("k-boss", "side:c1"));
    expect(faces).toContain(generatedFaceName("k-boss", "end:c1"));
    expect(faces).not.toContain(generatedFaceName("k-boss", "start:c1"));
    expect(new Set(faces).size).toBe(faces.length);
  });

  it("вырез насквозь сохраняет грани цели и даёт стенке отверстия имя инструмента", async () => {
    await buildBody(extrudeRequest(box, "k-plate"), "body-plate");
    const cut = await sendOk(extrudeRequest([circle("hole", 10, 5, 2)], "k-hole", {
      planeOffset: 10,
      distance: -10,
      operation: "cut",
      targetBodyId: "body-plate",
    }));

    expect(faceNames(cut)).toHaveLength(7);
    expect(faceNames(cut)).toContain(generatedFaceName("k-hole", "side:hole"));
    expect(faceNames(cut)).toContain(generatedFaceName("k-plate", "end:r1.0"));
  });

  it("скругление называет новую грань по ребру и сохраняет нетронутые рёбра", async () => {
    const base = await buildBody(extrudeRequest(box, "k-fillet-base"), "body-fillet");
    const [edge, ...others] = edgeNames(base);
    const filleted = await buildBody({ kind: "fillet", bodyId: "body-fillet", featureKey: "k-f1", edgeNames: [edge], radius: 1 }, "body-fillet-2");

    expect(faceNames(filleted)).toEqual(expect.arrayContaining(faceNames(base)));
    expect(faceNames(filleted)).toContain(generatedFaceName("k-f1", `fillet:${edge}`));
    expect(edgeNames(filleted)).not.toContain(edge);
    const survived = others.filter((name) => edgeNames(filleted).includes(name));
    expect(survived.length).toBeGreaterThanOrEqual(7);

    const second = await sendOk({ kind: "fillet", bodyId: "body-fillet-2", featureKey: "k-f2", edgeNames: [survived[survived.length - 1]], radius: 1 });
    expect(faceNames(second)).toContain(generatedFaceName("k-f2", `fillet:${survived[survived.length - 1]}`));
  });

  it("фаска с разными катетами и понятная ошибка на исчезнувшем ребре", async () => {
    const base = await buildBody(extrudeRequest(box, "k-chamfer"), "body-chamfer");
    const edge = edgeNames(base)[0];
    const chamfered = await sendOk({ kind: "chamfer", bodyId: "body-chamfer", featureKey: "k-c1", edgeNames: [edge], distance1: 1, distance2: 2 });
    expect(faceNames(chamfered)).toContain(generatedFaceName("k-c1", `chamfer:${edge}`));

    const missing = await send({ kind: "chamfer", bodyId: "body-chamfer", featureKey: "k-c2", edgeNames: ["e-missing"], distance1: 1, distance2: 1 });
    expect(missing.ok).toBe(false);
    expect(missing.error).toContain("больше не существует");
  });

  it("булева операция тело-тело сохраняет имена обоих тел", async () => {
    const left = await buildBody(extrudeRequest(box, "k-left"), "body-left");
    const right = await buildBody(extrudeRequest([rectangle("r2", 10, -5, 30, 5)], "k-right", { planeOffset: 5 }), "body-right");
    const union = await sendOk({ kind: "boolean", operation: "union", targetBodyId: "body-left", toolBodyIds: ["body-right"], featureKey: "k-union" });
    const faces = faceNames(union);

    expect(faces).toContain(generatedFaceName("k-left", "start:r1.0"));
    expect(faces).toContain(generatedFaceName("k-right", "end:r2.0"));
    expect(faces.filter((name) => faceNames(left).includes(name) || faceNames(right).includes(name)).length).toBe(faces.length);
  });

  it("вращение называет боковые грани по сегментам эскиза", async () => {
    const reply = await sendOk({
      kind: "revolve",
      entities: [rectangle("rr", 5, 0, 10, 4)],
      plane: "XY",
      planeOffset: 0,
      planeBasis: null,
      axisOrigin: { x: 0, y: 0 },
      axis: "y",
      angle: 90,
      direction: "symmetric",
      featureKey: "k-rev",
    });
    const faces = faceNames(reply);

    expect(faces).toHaveLength(6);
    for (const side of [0, 1, 2, 3]) expect(faces).toContain(generatedFaceName("k-rev", `side:rr.${side}`));
    expect(faces).toContain(generatedFaceName("k-rev", "start:rr.0"));
    expect(faces).toContain(generatedFaceName("k-rev", "end:rr.0"));
  });

  it("имена переживают сохранение в STEP и восстановление", async () => {
    const base = await buildBody(extrudeRequest([rectangle("r3", 0, 0, 8, 8)], "k-step"), "body-step");
    const filleted = await buildBody({ kind: "fillet", bodyId: "body-step", featureKey: "k-step-f", edgeNames: [edgeNames(base)[3]], radius: 2 }, "body-step-2");

    const restored = await sendOk({ kind: "hydrate", bodyId: "body-step-restored", step: filleted.step, naming: filleted.naming });
    expect(restored.mesh).toBeUndefined();
    const again = await sendOk({ kind: "fillet", bodyId: "body-step-restored", featureKey: "k-step-f2", edgeNames: [edgeNames(filleted)[0]], radius: 0.5 });
    expect(faceNames(again)).toEqual(expect.arrayContaining(faceNames(filleted)));

    const legacy = await sendOk({ kind: "hydrate", bodyId: "body-legacy", step: filleted.step, naming: null });
    expect(faceNames(legacy)).toHaveLength(faceNames(filleted).length);
  });
});
