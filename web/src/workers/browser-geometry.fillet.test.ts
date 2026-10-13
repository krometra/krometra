import { beforeAll, describe, expect, it, vi } from "vitest";
import { filletMergePlan } from "@/lib/browserFilletRun";
import type { TimelineEntry } from "@/types/api";
import { parentEdgeNames } from "./geometry/filletMerge";
import { namedBodyShape } from "./geometry/shapes";
import { buildBody, edgeNames, extrudeRequest, loadWorker, rectangle, send, sendOk } from "./testing/workerHarness";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

beforeAll(async () => {
  await loadWorker();
}, 60_000);

const cubeRequest = (featureKey: string) => extrudeRequest([rectangle("r", -10, -10, 10, 10)], featureKey, { distance: 20, direction: "symmetric" });

const filletEntry = (id: string, target: string, output: string, edges: string[]): TimelineEntry => ({
  id, timestamp: "", label: id, status: "ok", kind: "fillet", body_id: output,
  params: { target_body_id: target, edge_ids: edges, radius: 5, feature_key: `k-${id}`, engine: "browser_wasm" },
});

describe("пределы скругления в browser worker (реальный OCCT/WASM)", () => {
  it("двенадцатое ребро куба пересобирается от родителя вместе с первыми одиннадцатью", async () => {
    const cube = await buildBody(cubeRequest("k-fl-cube"), "fl-cube");
    const edges = edgeNames(cube);
    expect(edges).toHaveLength(12);
    await buildBody({ kind: "fillet", bodyId: "fl-cube", featureKey: "k-fl-f1", edgeNames: edges.slice(0, -1), radius: 5 }, "fl-f1");

    const direct = await send({ kind: "fillet", bodyId: "fl-f1", featureKey: "k-fl-f2", edgeNames: [edges[11]], radius: 5 });
    expect(direct.ok).toBe(false);

    const plan = filletMergePlan(
      [filletEntry("fl-f1", "fl-cube", "fl-f1", edges.slice(0, -1))],
      { bodyId: "fl-f1", edgeNames: [edges[11]], radius: 5 },
    );
    expect(plan).not.toBeNull();
    const merged = await sendOk({ kind: "fillet-merge", ...plan, radius: 5 });

    expect([...(merged.edgeNames as string[])].sort()).toEqual([...edges].sort());
    const straight = (merged.mesh?.brep_topo.edges ?? []).filter((edge) => {
      const line = edge.polyline ?? [];
      const end = line.length - 3;
      return Math.hypot(line[end] - line[0], line[end + 1] - line[1], line[end + 2] - line[2]) > 19;
    });
    expect(straight).toEqual([]);
    await sendOk({ kind: "discard", shapeHandle: merged.shapeHandle });
  });

  it("находит на родителе ребро без имени по геометрии", async () => {
    const cube = await buildBody(cubeRequest("k-fg-cube"), "fg-cube");
    const edges = edgeNames(cube);
    await buildBody({ kind: "fillet", bodyId: "fg-cube", featureKey: "k-fg-f1", edgeNames: [edges[0]], radius: 2 }, "fg-f1");
    const filleted = namedBodyShape("fg-f1");
    const kept = edges.find((name) => name !== edges[0] && filleted.naming.edges.includes(name)) ?? "";
    const renamed = { ...filleted, naming: { ...filleted.naming, edges: filleted.naming.edges.map((name) => (name === kept ? "e-renamed" : name)) } };

    const names = parentEdgeNames(namedBodyShape("fg-cube"), [{ bodyId: "fg-f1", edgeNames: [edges[0], "e-renamed"] }], () => renamed);

    expect(names).toEqual([edges[0], kept]);
  });

  it("объясняет слишком большой радиус и подсказывает, сколько помещается", async () => {
    const cube = await buildBody(cubeRequest("k-big-cube"), "big-cube");
    const reply = await send({ kind: "fillet", bodyId: "big-cube", featureKey: "k-big", edgeNames: [edgeNames(cube)[0]], radius: 20 });

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/^Скругление радиусом 20 мм на этом ребре не строится: соседняя геометрия не оставила места\. Здесь помещается примерно \d+\.\d мм\.$/);
  });
});
