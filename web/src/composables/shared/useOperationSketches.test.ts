import { describe, expect, it } from "vitest";
import { effectScope, ref } from "vue";
import { useOperationSketches } from "./useOperationSketches";

describe("useOperationSketches", () => {
  it("собирает эскизы всех открытых панелей и забывает панель вместе с её областью", () => {
    const root = effectScope();
    const extrudeSketch = ref<string | null>("s1");
    const sweepScope = effectScope();
    const operation = root.run(() => {
      const shared = useOperationSketches();
      shared.track("extrude", () => [extrudeSketch.value]);
      return shared;
    })!;
    sweepScope.run(() => useOperationSketches().track("sweep", () => ["s2", null, "s1"]));

    expect([...operation.ids.value]).toEqual(["s1", "s2"]);

    extrudeSketch.value = null;
    expect([...operation.ids.value]).toEqual(["s2", "s1"]);

    sweepScope.stop();
    expect([...operation.ids.value]).toEqual([]);
    root.stop();
  });
});
