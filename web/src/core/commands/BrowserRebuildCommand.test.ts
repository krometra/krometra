import { describe, expect, it } from "vitest";
import type { BrowserRebuiltBody } from "@/composables/editor/useBrowserGeometry";
import { browserRebuildForm } from "./BrowserRebuildCommand";

const basis = { origin: [0, 0, 30], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
const body = {
  bodyId: "body-000000000001", step: new ArrayBuffer(4), mesh: { vertices: [] }, naming: { version: 1, faces: [] },
  elapsedMs: 1, shapeHandle: "shape-1",
} as unknown as BrowserRebuiltBody;

describe("browserRebuildForm", () => {
  it("передаёт серверу пересчитанные плоскости эскизов в полях документа", () => {
    const form = browserRebuildForm("e1", { distance: 30 }, 7, [body], [
      { sketchId: "sketch-top", plane: "XY", planeOffset: 30, planeBasis: basis },
    ]);

    expect(JSON.parse(String(form.get("sketch_planes")))).toEqual({
      "sketch-top": { plane: "XY", plane_offset: 30, plane_basis: basis },
    });
    expect(JSON.parse(String(form.get("bodies")))).toEqual(["body-000000000001"]);
    expect(form.get("document_version")).toBe("7");
  });

  it("шлёт пустой набор плоскостей, когда эскизов на пересобранных телах нет", () => {
    expect(browserRebuildForm("e1", {}, 7, [], []).get("sketch_planes")).toBe("{}");
  });
});
