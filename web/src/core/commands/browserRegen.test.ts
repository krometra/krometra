import { describe, expect, it } from "vitest";
import type { BrowserRebuiltBody } from "@/composables/editor/useBrowserGeometry";
import type { TimelineEntry } from "@/types/api";
import { browserRegenForm, existingSeeds } from "./browserRegen";

const body = {
  bodyId: "body-000000000003", step: new ArrayBuffer(4), mesh: { vertices: [] }, naming: { version: 1, faces: [] },
  elapsedMs: 1, shapeHandle: "shape-3",
} as unknown as BrowserRebuiltBody;
const cut: TimelineEntry = { id: "t-cut", kind: "extrude", label: "Вырез", status: "error", error_message: "Нет тела.", timestamp: "" };

describe("browserRegenForm", () => {
  it("передаёт документ после правки, корни пересборки и тела", () => {
    const form = browserRegenForm({ components: { s1: { entities: [] } }, timeline: [cut] }, { roots: ["t-cut"], bodies: ["body-000000000001"] }, 9, [body], []);

    expect(JSON.parse(String(form.get("document")))).toEqual({ components: { s1: { entities: [] } }, timeline: [cut] });
    expect(JSON.parse(String(form.get("seeds")))).toEqual({ roots: ["t-cut"], bodies: ["body-000000000001"] });
    expect(JSON.parse(String(form.get("bodies")))).toEqual(["body-000000000003"]);
    expect(form.get("document_version")).toBe("9");
    expect(form.get("step:body-000000000003")).toBeInstanceOf(Blob);
  });
});

describe("existingSeeds", () => {
  it("после отмены оставляет только корни, которые есть в истории", () => {
    expect(existingSeeds({ components: {}, timeline: [cut] }, { roots: ["t-cut", "t-gone"], bodies: ["b1"] })).toEqual({ roots: ["t-cut"], bodies: ["b1"] });
  });
});
