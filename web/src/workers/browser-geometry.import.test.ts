import { beforeAll, describe, expect, it, vi } from "vitest";
import { drawRectangle, measureVolume, type Sketch } from "replicad";
import { IMPORT_EMPTY_FILE, IMPORT_NO_BODIES, IMPORT_SURFACES_ONLY, IMPORT_UNREADABLE } from "@/lib/browserImport";
import { MAX_IMPORT_BODIES, MAX_KERNEL_BODIES } from "@/lib/browserKernel";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import type { TimelineEntry } from "@/types/api";
import { bodyShape, namedBodyShape } from "./geometry/shapes";
import { buildBody, circle, edgeNames, extrudeRequest, faceNames, loadWorker, rectangle, send, sendOk, type WorkerReply } from "./testing/workerHarness";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  await loadWorker();
  await sendOk({ kind: "init" });
}, 60_000);

const box = [rectangle("r1", 0, 0, 20, 10)];
const rod = [circle("c1", 40, 5, 4)];
const text = (content: string) => new TextEncoder().encode(content).buffer as ArrayBuffer;

async function exportStep(...bodyIds: string[]): Promise<ArrayBuffer> {
  const reply = await sendOk({ kind: "export", format: "step", bodyIds });
  return reply.file as ArrayBuffer;
}

async function importStep(file: ArrayBuffer, existingBodies = 0): Promise<WorkerReply[]> {
  const reply = await sendOk({ kind: "import-step", file, existingBodies });
  return reply.imported as WorkerReply[];
}

async function retain(body: WorkerReply, bodyId: string) {
  await sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId });
}

async function discard(bodies: WorkerReply[]) {
  await Promise.all(bodies.map((body) => sendOk({ kind: "discard", shapeHandle: body.shapeHandle })));
}

function expectSameGeometry(imported: WorkerReply, importedId: string, source: WorkerReply, sourceId: string) {
  expect(measureVolume(bodyShape(importedId))).toBeCloseTo(measureVolume(bodyShape(sourceId)), 4);
  for (const side of ["min", "max"] as const) {
    imported.mesh?.bbox[side].forEach((value, axis) => expect(value).toBeCloseTo(source.mesh?.bbox[side][axis] ?? NaN, 4));
  }
  expect(faceNames(imported)).toHaveLength(faceNames(source).length);
  expect(edgeNames(imported)).toHaveLength(edgeNames(source).length);
}

describe("импорт STEP в browser worker (реальный OCCT/WASM)", () => {
  it("экспорт и импорт куба сохраняют объём, габариты и топологию", async () => {
    const source = await buildBody(extrudeRequest(box, "k-imp-box"), "imp-box-src");
    const [imported, ...rest] = await importStep(await exportStep("imp-box-src"));
    await retain(imported, "imp-box");

    expect(rest).toHaveLength(0);
    expect(faceNames(imported)).toHaveLength(6);
    expect(edgeNames(imported)).toHaveLength(12);
    expect(measureVolume(bodyShape("imp-box"))).toBeCloseTo(2000, 4);
    expectSameGeometry(imported, "imp-box", source, "imp-box-src");
    expect(imported.step?.byteLength).toBeGreaterThan(0);
    expect(imported.naming?.faces.map((face) => face.name)).toEqual(faceNames(imported));
  });

  it("экспорт и импорт цилиндра сохраняют круглые грани", async () => {
    const source = await buildBody(extrudeRequest(rod, "k-imp-rod", { distance: 25 }), "imp-rod-src");
    const [imported] = await importStep(await exportStep("imp-rod-src"));
    await retain(imported, "imp-rod");

    expect(faceNames(imported)).toHaveLength(3);
    expect(measureVolume(bodyShape("imp-rod"))).toBeCloseTo(Math.PI * 16 * 25, 3);
    expectSameGeometry(imported, "imp-rod", source, "imp-rod-src");
  });

  it("файл с несколькими телами даёт отдельное тело на каждое", async () => {
    const cube = await buildBody(extrudeRequest(box, "k-multi-box"), "multi-box-src");
    const cylinder = await buildBody(extrudeRequest(rod, "k-multi-rod", { distance: 25 }), "multi-rod-src");
    const imported = await importStep(await exportStep("multi-box-src", "multi-rod-src"));
    await retain(imported[0], "multi-0");
    await retain(imported[1], "multi-1");

    expect(imported).toHaveLength(2);
    const [importedCube, importedRod] = faceNames(imported[0]).length === 6 ? [0, 1] : [1, 0];
    expectSameGeometry(imported[importedCube], `multi-${importedCube}`, cube, "multi-box-src");
    expectSameGeometry(imported[importedRod], `multi-${importedRod}`, cylinder, "multi-rod-src");
    expect(faceNames(imported[0]).filter((name) => faceNames(imported[1]).includes(name))).toHaveLength(0);
  });

  it("импортированное тело экспортируется в STEP и STL вместе с построенным", async () => {
    await buildBody(extrudeRequest(box, "k-out-src"), "out-src");
    const [imported] = await importStep(await exportStep("out-src"));
    await retain(imported, "out-imported");

    const stl = await sendOk({ kind: "export", format: "stl", bodyIds: ["out-src", "out-imported"] });
    const again = await importStep(await exportStep("out-src", "out-imported"));

    expect(new DataView(stl.file as ArrayBuffer).getUint32(80, true)).toBe(24);
    expect(again).toHaveLength(2);
    expect([...faceNames(again[1])].sort()).toEqual([...faceNames(imported)].sort());
    await discard(again);
  });

  it("импортированное тело участвует в булевой операции и скруглении по своим именам", async () => {
    await buildBody(extrudeRequest(box, "k-bool-src"), "bool-src");
    const [imported] = await importStep(await exportStep("bool-src"));
    await retain(imported, "bool-target");
    await buildBody(extrudeRequest([circle("hole", 10, 5, 3)], "k-bool-tool", { distance: 30, planeOffset: -10 }), "bool-tool");

    const cut = await buildBody({ kind: "boolean", operation: "subtract", targetBodyId: "bool-target", toolBodyId: "bool-tool", featureKey: "k-bool" }, "bool-result");

    expect(measureVolume(bodyShape("bool-result"))).toBeCloseTo(2000 - Math.PI * 9 * 10, 2);
    expect(faceNames(cut)).toHaveLength(7);
    expect(faceNames(cut)).toEqual(expect.arrayContaining(faceNames(imported)));

    const filleted = await sendOk({ kind: "fillet", bodyId: "bool-target", featureKey: "k-bool-f", edgeNames: [edgeNames(imported)[0]], radius: 1 });
    expect(faceNames(filleted)).toHaveLength(7);
    await discard([filleted]);
  });

  it("имена граней и рёбер выводятся из геометрии и совпадают у двух импортов", async () => {
    await buildBody(extrudeRequest(box, "k-name-src"), "name-src");
    const file = await exportStep("name-src");
    const [first] = await importStep(file);
    const [second] = await importStep(file, 7);

    expect(faceNames(first).every((name) => name.startsWith("f-"))).toBe(true);
    expect(edgeNames(first).every((name) => name.startsWith("e-"))).toBe(true);
    expect(new Set(faceNames(first)).size).toBe(6);
    expect(new Set(edgeNames(first)).size).toBe(12);
    expect(faceNames(second)).toEqual(faceNames(first));
    expect(edgeNames(second)).toEqual(edgeNames(first));

    await buildBody(extrudeRequest(box, "k-name-other", { distance: 11 }), "name-other");
    const [other] = await importStep(await exportStep("name-other"));
    expect(faceNames(other).filter((name) => faceNames(first).includes(name))).toHaveLength(0);
    await discard([first, second, other]);
  });

  it("имена переживают гидрацию и повторный импорт сохранённого тела", async () => {
    await buildBody(extrudeRequest([rectangle("r2", 3, 4, 17, 9), circle("c2", 10, 6.5, 2)], "k-hyd-src", { distance: 7 }), "hyd-src");
    const [imported] = await importStep(await exportStep("hyd-src"));
    const stored = imported.step?.slice(0) as ArrayBuffer;

    await sendOk({ kind: "hydrate", bodyId: "hyd-restored", step: imported.step, naming: imported.naming });
    expect([...namedBodyShape("hyd-restored").naming.faces].sort()).toEqual([...faceNames(imported)].sort());
    expect([...namedBodyShape("hyd-restored").naming.edges].sort()).toEqual([...edgeNames(imported)].sort());
    const straight = imported.mesh?.brep_topo.edges.find((edge) => edge.polyline?.length === 6);
    const filleted = await sendOk({ kind: "fillet", bodyId: "hyd-restored", featureKey: "k-hyd-f", edgeNames: [String(straight?.edge_id)], radius: 0.5 });
    expect(faceNames(filleted)).toEqual(expect.arrayContaining(faceNames(imported)));

    const [again] = await importStep(stored);
    expect([...faceNames(again)].sort()).toEqual([...faceNames(imported)].sort());
    expect([...edgeNames(again)].sort()).toEqual([...edgeNames(imported)].sort());
    await discard([imported, filleted, again]);
  });

  it("запись импорта пересобирается как корень без параметров", async () => {
    await buildBody(extrudeRequest(box, "k-root-src"), "root-src");
    const [imported] = await importStep(await exportStep("root-src"));
    await retain(imported, "root-import");
    const edge = edgeNames(imported)[0];
    const filleted = await buildBody({ kind: "fillet", bodyId: "root-import", featureKey: "k-root-f", edgeNames: [edge], radius: 1 }, "root-fillet");
    const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({ timestamp: "", label: patch.id, status: "ok", ...patch });
    const document: RebuildDocument = {
      components: {},
      timeline: [
        entry({ id: "imp", kind: "import", body_id: "root-import", params: { file_name: "part.step", engine: "browser_wasm" } }),
        entry({ id: "f1", kind: "fillet", body_id: "root-fillet", params: { target_body_id: "root-import", edge_ids: [edge], radius: 1, feature_key: "k-root-f", engine: "browser_wasm" } }),
      ],
    };

    const steps = browserRebuildPlan(document, "imp", {});
    const reply = await sendOk({ kind: "rebuild", steps });
    const [root, fillet] = reply.bodies as (WorkerReply & { bodyId: string })[];

    expect(steps.map((step) => step.kind)).toEqual(["import", "fillet"]);
    expect(root.bodyId).toBe("root-import");
    expect([...faceNames(root)].sort()).toEqual([...faceNames(imported)].sort());
    expect([...faceNames(fillet)].sort()).toEqual([...faceNames(filleted)].sort());
    await retain(root, "root-import");
    await retain(fillet, "root-fillet");
    expect(measureVolume(bodyShape("root-import"))).toBeCloseTo(2000, 4);
  });

  it("объясняет, почему файл не импортирован", async () => {
    const header = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('x','2026-01-01T00:00:00',(''),(''),'','','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\n";
    const surface = await (drawRectangle(10, 10).sketchOnPlane("XY") as Sketch).face().blobSTEP().arrayBuffer();
    await buildBody(extrudeRequest(box, "k-err-a"), "err-a");
    await buildBody(extrudeRequest(rod, "k-err-b"), "err-b");
    const pair = await exportStep("err-a", "err-b");
    const single = await exportStep("err-a");

    const failures: [ArrayBuffer, number, string][] = [
      [new ArrayBuffer(0), 0, IMPORT_EMPTY_FILE],
      [text("это не STEP"), 0, IMPORT_UNREADABLE],
      [single.slice(0, single.byteLength / 2), 0, IMPORT_UNREADABLE],
      [text(`${header}DATA;\nENDSEC;\nEND-ISO-10303-21;\n`), 0, IMPORT_NO_BODIES],
      [surface, 0, IMPORT_SURFACES_ONLY],
      [pair, MAX_KERNEL_BODIES - 1, `больше предела браузерного ядра (${MAX_KERNEL_BODIES})`],
    ];
    for (const [file, existingBodies, message] of failures) {
      const reply = await send({ kind: "import-step", file, existingBodies });
      expect(reply.ok).toBe(false);
      expect(reply.error).toContain(message);
    }
    expect(MAX_IMPORT_BODIES).toBeLessThan(MAX_KERNEL_BODIES);

    const alive = await importStep(single);
    expect(alive).toHaveLength(1);
    await discard(alive);
  });
});
