import { reactive } from "vue";
import { describe, expect, it } from "vitest";
import { cloneBrowserWorkerInput } from "./useBrowserGeometry";

describe("cloneBrowserWorkerInput", () => {
  it("превращает реактивный эскиз в structured-cloneable данные", () => {
    const sketch = reactive({
      entities: [{ id: "line-1", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }],
      plane: "XY",
      planeOffset: 0,
      planeBasis: null,
    });

    const payload = cloneBrowserWorkerInput(sketch);

    expect(structuredClone(payload)).toEqual({
      entities: [{ id: "line-1", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }],
      plane: "XY",
      planeOffset: 0,
      planeBasis: null,
    });
  });
});
