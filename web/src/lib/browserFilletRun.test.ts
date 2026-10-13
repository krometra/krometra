import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { filletMergePlan, trailingBrowserFilletRun } from "./browserFilletRun";

const fillet = (id: string, target: string, output: string, edges: string[], radius = 5): TimelineEntry => ({
  id, timestamp: "", label: id, status: "ok", kind: "fillet", body_id: output,
  params: { target_body_id: target, edge_ids: edges, radius, feature_key: `k-${id}`, engine: "browser_wasm" },
});
const extrude: TimelineEntry = {
  id: "e1", timestamp: "", label: "e1", status: "ok", kind: "extrude", body_id: "cube", params: { engine: "browser_wasm" },
};

describe("хвост browser-скруглений", () => {
  it("собирает цепочку скруглений того же радиуса до родителя", () => {
    const timeline = [extrude, fillet("f1", "cube", "b1", ["e-1"]), fillet("f2", "b1", "b2", ["e-2"])];
    expect(trailingBrowserFilletRun(timeline, "b2", 5).map((entry) => entry.id)).toEqual(["f1", "f2"]);
  });

  it("обрывается на другом радиусе и на не-скруглении", () => {
    const timeline = [extrude, fillet("f1", "cube", "b1", ["e-1"], 2), fillet("f2", "b1", "b2", ["e-2"])];
    expect(trailingBrowserFilletRun(timeline, "b2", 5).map((entry) => entry.id)).toEqual(["f2"]);
    expect(trailingBrowserFilletRun(timeline, "cube", 5)).toEqual([]);
  });

  it("не трогает тело, от которого зависят другие операции", () => {
    const branch = fillet("side", "b1", "b9", ["e-7"]);
    const timeline = [extrude, fillet("f1", "cube", "b1", ["e-1"]), fillet("f2", "b1", "b2", ["e-2"]), branch];
    expect(trailingBrowserFilletRun(timeline, "b2", 5).map((entry) => entry.id)).toEqual(["f2"]);
  });

  it("строит план слияния: родитель, рёбра по телам и ключ первой операции", () => {
    const timeline = [extrude, fillet("f1", "cube", "b1", ["e-1", "e-2"])];
    expect(filletMergePlan(timeline, { bodyId: "b1", edgeNames: ["e-3"], radius: 5 })).toEqual({
      entryIds: ["f1"],
      parentBodyId: "cube",
      sources: [{ bodyId: "cube", edgeNames: ["e-1", "e-2"] }, { bodyId: "b1", edgeNames: ["e-3"] }],
      featureKey: "k-f1",
    });
    expect(filletMergePlan([extrude], { bodyId: "cube", edgeNames: ["e-1"], radius: 5 })).toBeNull();
  });
});
