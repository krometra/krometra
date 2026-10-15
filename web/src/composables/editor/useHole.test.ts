import { describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { HolePreview } from "@/lib/holeGeometry";
import type { MeshData } from "@/types/api";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { ComponentEntry, useDocumentModel } from "./useDocumentModel";
import type { SelectionMode, ViewportRef } from "./types";
import { useHole } from "./useHole";

const plateMesh: MeshData = {
  vertices: [0, 0, 20, 40, 0, 20, 40, 20, 20, 0, 20, 20, 0, 0, 0, 0, 20, 0, 0, 20, 20],
  indices: [0, 1, 2, 0, 2, 3, 4, 5, 6],
  face_triangle_map: ["f-top", "f-top", "f-side"],
  brep_topo: { faces: [], edges: [] },
  bbox: { min: [0, 0, 0], max: [40, 20, 20] },
};
const sideMesh: MeshData = {
  ...plateMesh,
  vertices: [0, 0, 20, 40, 0, 20, 40, 20, 25, 0, 20, 20, 0, 0, 0, 0, 20, 0, 0, 20, 20],
};

const holeSketch: ComponentEntry = {
  id: "sk-holes",
  plane: "XY",
  plane_offset: 0,
  entities: [
    { id: "a", type: "circle", center: { x: 5, y: 5 }, radius: 2 },
    { id: "b", type: "circle", center: { x: 15, y: 5 }, radius: 2 },
  ],
};
const lineSketch: ComponentEntry = { id: "sk-lines", plane: "XY", entities: [{ id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }] };

function setup(mesh: MeshData = plateMesh) {
  const viewport = { showHolePreview: vi.fn(), hideHolePreview: vi.fn(), clearHighlight: vi.fn(), setMeshVisibility: vi.fn() };
  const meshes = { meshBodies: ref([{ body_id: "body-plate", mesh }]), replaceMesh: vi.fn() } as unknown as BodyMeshesApi;
  const model = { sketches: ref([holeSketch, lineSketch]) } as unknown as ReturnType<typeof useDocumentModel>;
  const scope = effectScope();
  const hole = scope.run(() => useHole({
    projectId: "p",
    viewportRef: ref(viewport) as unknown as ViewportRef,
    viewportSelectionMode: ref<SelectionMode>("edge"),
    meshes,
    model,
  }))!;
  const lastPreview = () => viewport.showHolePreview.mock.calls.at(-1)?.[0] as HolePreview[] | undefined;
  return { hole, viewport, lastPreview, stop: () => scope.stop() };
}

const pick = (point: [number, number, number], faceId = "f-top") => ({ bodyId: "body-plate", faceId, brepTopo: plateMesh.brep_topo, point });

describe("useHole", () => {
  it("вне режима отверстия клики по граням не перехватывает", () => {
    const { hole, stop } = setup();

    expect(hole.onFaceSelected(pick([10, 10, 20]))).toBe(false);
    stop();
  });

  it("каждый клик по плоской грани ставит центр, призрак смотрит внутрь материала", async () => {
    const { hole, lastPreview, stop } = setup();
    hole.enter();

    expect(hole.onFaceSelected(pick([10, 10, 20]))).toBe(true);
    hole.onFaceSelected(pick([30, 10, 20.0001]));
    await nextTick();

    expect(hole.centers.value).toEqual([[10, 10, 20], [30, 10, 20]]);
    expect(lastPreview()?.map((preview) => preview.axis)).toEqual([[-0, -0, -1], [-0, -0, -1]]);
    expect(lastPreview()?.[0].center).toEqual([10, 10, 20]);
    stop();
  });

  it("клик по другой грани начинает набор центров заново", () => {
    const { hole, stop } = setup();
    hole.enter();
    hole.onFaceSelected(pick([10, 10, 20]));
    hole.onFaceSelected(pick([0, 5, 5], "f-side"));

    expect(hole.faceId.value).toBe("f-side");
    expect(hole.centers.value).toEqual([[0, 5, 5]]);
    stop();
  });

  it("на неплоской грани объясняет, почему отверстия не будет", () => {
    const { hole, stop } = setup(sideMesh);
    hole.enter();
    hole.onFaceSelected(pick([10, 10, 20]));

    expect(hole.faceHint.value).toMatch(/плоскую грань/);
    expect(hole.centers.value).toEqual([]);
    stop();
  });

  it("центры из эскиза — окружности, спроецированные на грань; клики их не дополняют", () => {
    const { hole, stop } = setup();
    hole.enter();
    hole.setSketch("sk-holes");
    hole.onFaceSelected(pick([30, 10, 20]));

    expect(hole.sketchOptions.value.map((option) => option.id)).toEqual(["sk-holes"]);
    expect(hole.centers.value).toEqual([[5, 5, 20], [15, 5, 20]]);
    expect(hole.clickedCenters.value).toEqual([]);
    stop();
  });

  it("убирает центр и прячет призрак, пока размеры недопустимы", async () => {
    const { hole, lastPreview, stop } = setup();
    hole.enter();
    hole.onFaceSelected(pick([10, 10, 20]));
    hole.onFaceSelected(pick([30, 10, 20]));
    hole.removeCenter(0);
    hole.updateSpec({ type: "counterbore", cboreDiameter: 3 });
    await nextTick();

    expect(hole.centers.value).toEqual([[30, 10, 20]]);
    expect(hole.specError.value).toMatch(/Диаметр цековки/);
    expect(lastPreview()).toEqual([]);
    stop();
  });

  it("выход сбрасывает выбор и убирает призрак", () => {
    const { hole, viewport, stop } = setup();
    hole.enter();
    hole.onFaceSelected(pick([10, 10, 20]));
    hole.exit();

    expect(hole.holeMode.value).toBe(false);
    expect(hole.centers.value).toEqual([]);
    expect(viewport.hideHolePreview).toHaveBeenCalled();
    stop();
  });
});
