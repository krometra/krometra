import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import { describeBodyTopology } from "@/lib/control/topology";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import { bodyMetrics, boxFixture, buildFixture, expectFixture, expectMetrics, type ShapeFixture } from "./testing/shapeFixture";
import { buildBody, circle, extrudeRequest, faceNames, rectangle, send, sendOk, type WorkerReply } from "./testing/workerHarness";
import { browserEntry, edgeBetween, loadQuietWorker, rebuiltBodies } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const SIDE = 20;
const ROD_RADIUS = 5;
const BOX = "sh-box";
const ROD = "sh-rod";
const FILLET_GAP = 1 - Math.PI / 4;
const boxSketch = [rectangle("r", 0, 0, SIDE, SIDE)];

let box: WorkerReply;
let rod: WorkerReply;
let top = "";
let side = "";
let rodTop = "";

function faceAt(reply: WorkerReply, centroid: Vector3): string {
  const faces = describeBodyTopology("", reply.mesh!).faces.filter((face) => (
    face.centroid !== null && Math.hypot(...centroid.map((value, axis) => value - face.centroid![axis])) < 1e-3
  ));
  if (faces.length !== 1) throw new Error(`Граней с центром ${centroid}: ${faces.length}.`);
  return faces[0].id;
}

beforeAll(async () => {
  await loadQuietWorker();
  box = await buildBody(extrudeRequest(boxSketch, "k-sh-box", { distance: SIDE }), BOX);
  top = faceAt(box, [10, 10, SIDE]);
  side = faceAt(box, [SIDE, 10, 10]);
  rod = await buildBody(extrudeRequest([circle("c", 0, 0, ROD_RADIUS)], "k-sh-rod", { distance: SIDE }), ROD);
  rodTop = faceAt(rod, [0, 0, SIDE]);
}, 60_000);

let nextKey = 1;
function shellRequest(bodyId: string, faceNames: string[], thickness: number, direction = "inward") {
  return { kind: "shell", bodyId, faceNames, thickness, direction, featureKey: `k-sh-${nextKey++}` };
}

function openBox(height: number, wall: number): ShapeFixture {
  const inner = SIDE - 2 * wall;
  const depth = height - wall;
  return {
    volume: SIDE * SIDE * height - inner * inner * depth,
    area: SIDE * SIDE + 4 * SIDE * height + (SIDE * SIDE - inner * inner) + inner * inner + 4 * inner * depth,
    min: [0, 0, 0],
    max: [SIDE, SIDE, height],
    faces: 11,
    edges: 24,
  };
}

describe("оболочка: эталоны (реальный OCCT/WASM)", () => {
  it("внутрь с открытым верхом: стенки и дно заданной толщины, габарит прежний", async () => {
    await buildFixture(shellRequest(BOX, [top], 2), "sh-open", openBox(SIDE, 2));
  });

  it("наружу: стенки растут за габарит, открытый торец остаётся на месте", async () => {
    const grown = 24 * 24 * 22 - SIDE ** 3;
    await buildFixture(shellRequest(BOX, [top], 2, "outward"), "sh-outward", {
      volume: grown,
      min: [-2, -2, -2],
      max: [22, 22, SIDE],
      faces: 11,
    });
  });

  it("несколько открытых граней одной операцией", async () => {
    await buildFixture(shellRequest(BOX, [top, side], 2), "sh-two", {
      volume: SIDE ** 3 - 18 * 16 * 18,
      min: [0, 0, 0],
      max: [SIDE, SIDE, SIDE],
      faces: 10,
    });
  });

  it("корпус со скруглёнными углами: внутренняя стенка повторяет скругление с меньшим радиусом", async () => {
    const corners = [[0, 0], [SIDE, 0], [SIDE, SIDE], [0, SIDE]].map(([x, y]) => edgeBetween(box, [x, y, 0], [x, y, SIDE]));
    await buildBody({ kind: "fillet", bodyId: BOX, featureKey: "k-sh-rounded", edgeNames: corners, radius: 3 }, "sh-rounded");
    const roundedArea = (side: number, radius: number) => side ** 2 - (4 - Math.PI) * radius ** 2;
    await buildFixture(shellRequest("sh-rounded", [top], 1), "sh-enclosure", {
      volume: roundedArea(SIDE, 3) * SIDE - roundedArea(SIDE - 2, 2) * (SIDE - 1),
      min: [0, 0, 0],
      max: [SIDE, SIDE, SIDE],
      faces: 19,
    });
  });

  it("цилиндр с открытым торцом становится стаканом", async () => {
    await buildFixture(shellRequest(ROD, [rodTop], 1), "sh-cup", {
      volume: Math.PI * (ROD_RADIUS ** 2 * SIDE - (ROD_RADIUS - 1) ** 2 * (SIDE - 1)),
      min: [-ROD_RADIUS, -ROD_RADIUS, 0],
      max: [ROD_RADIUS, ROD_RADIUS, SIDE],
      faces: 5,
    });
  });
});

describe("оболочка: стабильные имена граней", () => {
  it("внешние грани и кромка открытого торца сохраняют имена исходного тела", async () => {
    const shelled = await buildBody(shellRequest(BOX, [top], 2), "sh-names");
    const names = faceNames(shelled);

    expect(names).toEqual(expect.arrayContaining(faceNames(box)));
    expect(faceAt(shelled, [10, 10, SIDE])).toBe(top);
    expect(names).toHaveLength(11);
  });

  it("одна и та же операция даёт одни и те же имена внутренних стенок", async () => {
    const request = { ...shellRequest(BOX, [top], 2), featureKey: "k-sh-repeat" };
    const first = faceNames(await buildBody(request, "sh-repeat-1"));
    const second = faceNames(await buildBody(request, "sh-repeat-2"));

    expect(second).toEqual(first);
  });
});

describe("оболочка: отказы с объяснением", () => {
  it("слишком толстая стенка называет толщину, которая помещается", async () => {
    const reply = await send(shellRequest(BOX, [top], 12));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/Толщина стенки 12 мм больше допустимой для этого тела: оболочка внутрь помещается примерно до 9\.8 мм/);
    expectMetrics(bodyMetrics(BOX), boxFixture([0, 0, 0], [SIDE, SIDE, SIDE]));
  });

  it("стенка толще радиуса цилиндра не даёт вывернутого тела", async () => {
    const reply = await send(shellRequest(ROD, [rodTop], 6));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/больше допустимой.*примерно до 4\.9 мм/);
  });

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["нулевая толщина", { thickness: 0 }, /больше нуля/],
    ["нечисловая толщина", { thickness: Number.NaN }, /больше нуля/],
    ["неизвестное направление", { direction: "sideways" }, /внутрь или наружу/],
    ["без открытых граней", { faceNames: [] }, /хотя бы одну грань/],
    ["повтор грани", { faceNames: ["f-a", "f-a"] }, /не должны повторяться/],
    ["грань, которой нет в теле", { faceNames: ["f-missing"] }, /не существует/],
    ["тело, которого нет в ядре", { bodyId: "sh-missing" }, /не загружено/],
  ])("отклоняет: %s", async (_name, overrides, message) => {
    const reply = await send({ ...shellRequest(BOX, [top], 2), ...overrides });

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(message);
  });
});

describe("пересборка цепочки выдавливание - оболочка - скругление (реальный OCCT/WASM)", () => {
  const document: RebuildDocument = { components: {}, timeline: [] };
  const corner = (height: number) => ({ min: [0, 0, 0] as Vector3, max: [SIDE, SIDE, height] as Vector3 });

  function rounded(height: number, wall: number): ShapeFixture {
    const shell = openBox(height, wall);
    return { ...shell, volume: shell.volume - FILLET_GAP * height, area: undefined, faces: 12, edges: undefined };
  }

  async function rebuild(entryId: string, params: Record<string, unknown>) {
    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, entryId, params) });
    const entry = document.timeline.find((candidate) => candidate.id === entryId);
    if (entry) entry.params = { ...entry.params, ...params };
    const bodies = rebuiltBodies(reply);
    for (const body of bodies) await sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId: body.bodyId });
    return new Map(bodies.map((body) => [body.bodyId, body]));
  }

  beforeAll(async () => {
    const base = await buildBody(extrudeRequest(boxSketch, "k-rs-box", { distance: SIDE }), "rs-box");
    const opening = faceAt(base, [10, 10, SIDE]);
    const shelled = await buildBody({ kind: "shell", bodyId: "rs-box", faceNames: [opening], thickness: 2, direction: "inward", featureKey: "k-rs-shell" }, "rs-shell");
    const edge = edgeBetween(shelled, [0, 0, 0], [0, 0, SIDE]);
    await buildBody({ kind: "fillet", bodyId: "rs-shell", featureKey: "k-rs-fillet", edgeNames: [edge], radius: 1 }, "rs-rounded");
    document.components = { "s-box": { type: "sketch", plane: "XY", plane_offset: 0, entities: boxSketch } };
    document.timeline = [
      browserEntry({ id: "e-box", kind: "extrude", sketch_id: "s-box", body_id: "rs-box", params: { distance: SIDE, feature_key: "k-rs-box" } }),
      browserEntry({ id: "sh-walls", kind: "shell", body_id: "rs-shell", params: {
        target_body_id: "rs-box", face_ids: [opening], thickness: 2, direction: "inward", feature_key: "k-rs-shell",
      } }),
      browserEntry({ id: "f-corner", kind: "fillet", body_id: "rs-rounded", params: {
        target_body_id: "rs-shell", edge_ids: [edge], radius: 1, feature_key: "k-rs-fillet",
      } }),
    ];
  });

  it("новая высота выдавливания проходит через оболочку и скругление по именам", async () => {
    const bodies = await rebuild("e-box", { distance: 30 });

    expect([...bodies.keys()]).toEqual(["rs-box", "rs-shell", "rs-rounded"]);
    await expectFixture("rs-shell", bodies.get("rs-shell")!, openBox(30, 2));
    expectMetrics(bodyMetrics("rs-rounded"), { ...rounded(30, 2), ...corner(30), tolerance: 1e-5 });
  });

  it("новая толщина стенки пересобирает оболочку и скругление, не трогая основу", async () => {
    const bodies = await rebuild("sh-walls", { thickness: 3 });

    expect([...bodies.keys()]).toEqual(["rs-shell", "rs-rounded"]);
    await expectFixture("rs-shell", bodies.get("rs-shell")!, openBox(30, 3));
    expectMetrics(bodyMetrics("rs-rounded"), { ...rounded(30, 3), ...corner(30), tolerance: 1e-5 });
  });

  it("недопустимая толщина отклоняет пересборку целиком и оставляет тела прежними", async () => {
    const reply = await send({ kind: "rebuild", steps: browserRebuildPlan(document, "sh-walls", { thickness: 40 }) });

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/больше допустимой/);
    expectMetrics(bodyMetrics("rs-shell"), openBox(30, 3));
  });
});
