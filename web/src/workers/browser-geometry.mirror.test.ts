import { beforeAll, describe, expect, it, vi } from "vitest";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import { describeBodyTopology } from "@/lib/control/topology";
import { mirroredFaceName } from "@/lib/mirrorPlane";
import type { MeshData } from "@/types/api";
import { boxFixture, buildFixture, expectFixture } from "./testing/shapeFixture";
import { buildBody, extrudeRequest, faceNames, rectangle, send, sendOk, type WorkerReply } from "./testing/workerHarness";
import { browserEntry, loadQuietWorker, rebuiltBodies } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const BOX = "mr-box";
const BOX_KEY = "k-mr-box";
const sketch = [rectangle("r", 0, 0, 10, 4)];
let source: WorkerReply;

function faceWithNormal(reply: WorkerReply, normal: [number, number, number]): string {
  const faces = describeBodyTopology("probe", reply.mesh as MeshData).faces;
  const face = faces.find((candidate) => candidate.normal?.every((value, axis) => Math.abs(value - normal[axis]) < 1e-6));
  if (!face) throw new Error(`Нет плоской грани с нормалью ${normal.join(", ")}`);
  return face.id;
}

function mirrorRequest(patch: Record<string, unknown>) {
  return { kind: "mirror", bodyId: BOX, plane: { kind: "base", plane: "YZ", offset: 0 }, merge: false, ...patch };
}

beforeAll(async () => {
  await loadQuietWorker();
  source = await buildBody(extrudeRequest(sketch, BOX_KEY, { distance: 2 }), BOX);
  await buildBody(extrudeRequest(sketch, "k-mr-slab", { distance: 2 }), "mr-slab");
}, 60_000);

describe("зеркало через сообщения worker (реальный OCCT/WASM)", () => {
  it("отражённая копия — полноценное тело с именами, выведенными из имён исходных граней", async () => {
    const copy = await buildFixture(mirrorRequest({ featureKey: "k-mr-copy" }), "mr-copy", boxFixture([-10, 0, 0], [0, 4, 2]));

    expect([...faceNames(copy)].sort()).toEqual(faceNames(source).map((name) => mirroredFaceName("k-mr-copy", name)).sort());
  });

  it("объединение с исходным по его плоской грани даёт одно тело вдвое длиннее", async () => {
    const xFace = faceWithNormal(source, [1, 0, 0]);
    const merged = await buildFixture(
      mirrorRequest({ plane: { kind: "face", faceId: xFace }, merge: true, featureKey: "k-mr-merge" }),
      "mr-merged",
      boxFixture([0, 0, 0], [20, 4, 2]),
    );

    const kept = faceNames(merged).filter((name) => faceNames(source).includes(name));
    expect(kept, "грани исходного тела, кроме грани зеркала, сохранили имена").toHaveLength(5);
    expect(kept).not.toContain(xFace);
  });

  it("пересборка после правки выдавливания переносит зеркало по имени грани", async () => {
    const xFace = faceWithNormal(source, [1, 0, 0]);
    const document: RebuildDocument = {
      components: { "s-box": { type: "sketch", plane: "XY", plane_offset: 0, entities: sketch } },
      timeline: [
        browserEntry({ id: "e-box", kind: "extrude", sketch_id: "s-box", body_id: BOX, params: { distance: 2, feature_key: BOX_KEY } }),
        browserEntry({ id: "m-box", kind: "mirror", body_id: "mr-rebuilt", params: {
          target_body_id: BOX, plane: null, offset: 0, face_id: xFace, merge: true, feature_key: "k-mr-merge",
        } }),
      ],
    };

    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "e-box", { distance: 5 }) });
    const bodies = rebuiltBodies(reply);
    for (const body of bodies) await sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId: body.bodyId });

    expect(bodies.map((body) => body.bodyId)).toEqual([BOX, "mr-rebuilt"]);
    await expectFixture("mr-rebuilt", bodies[1], boxFixture([0, 0, 0], [20, 4, 5]));
  }, 60_000);

  it("правка плоскости зеркала из дерева пересобирает его с новой плоскостью", async () => {
    const document: RebuildDocument = {
      components: {},
      timeline: [
        browserEntry({ id: "m-copy", kind: "mirror", body_id: "mr-moved", params: {
          target_body_id: "mr-slab", plane: "YZ", offset: 0, face_id: null, merge: false, feature_key: "k-mr-slab-copy",
        } }),
      ],
    };

    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "m-copy", { plane: "XZ", offset: -1 }) });
    const [moved] = rebuiltBodies(reply);
    await sendOk({ kind: "retain", shapeHandle: moved.shapeHandle, bodyId: "mr-moved" });

    await expectFixture("mr-moved", moved, boxFixture([0, -6, 0], [10, -2, 2]));
  }, 60_000);

  it("отклоняет тело, которого нет в ядре, и грань, которой нет у тела", async () => {
    const missingBody = await send(mirrorRequest({ bodyId: "mr-missing", featureKey: "k-mr-x" }));
    expect(missingBody.ok).toBe(false);
    expect(missingBody.error).toMatch(/не загружено/);

    const missingFace = await send(mirrorRequest({ plane: { kind: "face", faceId: "f-none" }, featureKey: "k-mr-x" }));
    expect(missingFace.ok).toBe(false);
    expect(missingFace.error).toMatch(/больше не существует/);
    expect(missingFace.shapeHandle).toBeUndefined();
  });
});
