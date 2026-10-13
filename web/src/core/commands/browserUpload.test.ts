import { describe, expect, it } from "vitest";
import type { MeshData } from "@/types/api";
import { browserImportForm } from "./browserUpload";

const mesh = (faceId: string): MeshData => ({
  vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  indices: [0, 1, 2],
  brep_topo: { faces: [{ face_id: faceId, edges: [] }], edges: [] },
  bbox: { min: [0, 0, 0], max: [1, 1, 0] },
  face_triangle_map: [faceId],
});

const body = (faceId: string, bytes: number) => ({
  step: new Uint8Array(bytes).buffer as ArrayBuffer,
  mesh: mesh(faceId),
  naming: { version: 1 as const, faces: [{ name: faceId, fingerprint: [0, 0, 0, 1] as [number, number, number, number] }] },
});

describe("browserImportForm", () => {
  it("кладёт тела параллельными списками в порядке импорта", () => {
    const form = browserImportForm("pair.step", 9, [body("f-a", 3), body("f-b", 5)]);
    const steps = form.getAll("steps") as File[];

    expect(form.get("file_name")).toBe("pair.step");
    expect(form.get("document_version")).toBe("9");
    expect(steps.map((step) => [step.name, step.size, step.type])).toEqual([
      ["import-1.step", 3, "application/step"],
      ["import-2.step", 5, "application/step"],
    ]);
    expect(form.getAll("meshes").map((value) => JSON.parse(String(value)).face_triangle_map[0])).toEqual(["f-a", "f-b"]);
    expect(form.getAll("namings").map((value) => JSON.parse(String(value)).faces[0].name)).toEqual(["f-a", "f-b"]);
  });
});
