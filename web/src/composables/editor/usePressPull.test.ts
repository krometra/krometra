import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { MeshData } from "@/types/api";
import type { SelectionMode } from "./types";
import { usePressPull } from "./usePressPull";

const executed: unknown[] = [];
const load = vi.fn(async () => undefined);
let failure: Error | null = null;

vi.mock("@/composables/shared/useDocument", () => ({ useDocument: () => ({ document: ref({ version: 4 }), load, markDirty: vi.fn() }) }));
vi.mock("@/composables/shared/useSelection", () => ({ useSelection: () => ({ clearSelection: vi.fn() }) }));
vi.mock("@/composables/useParameters", () => ({ useParameters: () => ({ parameters: ref([]) }) }));
vi.mock("@/composables/shared/useUndoRedo", () => ({
  useUndoRedo: () => ({ execute: async (command: { perform: () => Promise<void> }) => command.perform() }),
}));
vi.mock("@/core/commands/BrowserPressPullCommand", () => ({
  BrowserPressPullCommand: class {
    private result: unknown = null;
    constructor(_projectId: string, private feature: { bodyId: string; newBody: boolean }) {}
    async perform() {
      if (failure) throw failure;
      executed.push(this.feature);
      this.result = { bodyId: "body-result", mesh: MESH, hiddenBodyIds: this.feature.newBody ? [] : [this.feature.bodyId] };
    }
    getResult() {
      return this.result;
    }
  },
}));

const MESH: MeshData = {
  vertices: [0, 0, 10, 20, 0, 10, 20, 20, 10, 0, 20, 10],
  indices: [0, 1, 2, 0, 2, 3],
  face_triangle_map: ["f-top", "f-top"],
  brep_topo: { faces: [{ face_id: "f-top", edges: [] }, { face_id: "f-side", edges: [] }], edges: [] },
  bbox: { min: [0, 0, 0], max: [20, 20, 10] },
};

function setup() {
  const viewport = {
    clearHighlight: vi.fn(),
    markFaces: vi.fn(),
    clearMarkedFaces: vi.fn(),
    showPressPullPreview: vi.fn(),
    hidePressPullPreview: vi.fn(),
  };
  const meshes = { meshBodies: ref([{ body_id: "box", mesh: MESH }]), untrackMesh: vi.fn(), trackMesh: vi.fn() };
  const selectionMode = ref<SelectionMode>("edge");
  const scope = effectScope();
  const pressPull = scope.run(() => usePressPull({
    projectId: "p",
    viewportRef: ref(viewport) as never,
    viewportSelectionMode: selectionMode,
    meshes: meshes as never,
  }))!;
  return { pressPull, viewport, meshes, selectionMode };
}

const pick = (faceId: string, bodyId = "box") => ({ bodyId, faceId, brepTopo: MESH.brep_topo });

beforeEach(() => {
  executed.length = 0;
  failure = null;
  vi.clearAllMocks();
});

describe("usePressPull", () => {
  it("вне режима клик по грани не перехватывает", () => {
    const { pressPull } = setup();
    expect(pressPull.onFaceSelected(pick("f-top"))).toBe(false);
  });

  it("клики набирают и снимают грани одного тела, другое тело начинает выбор заново", () => {
    const { pressPull, viewport, selectionMode } = setup();
    pressPull.enter();
    expect(selectionMode.value).toBe("face");
    pressPull.onFaceSelected(pick("f-top"));
    pressPull.onFaceSelected(pick("f-side"));
    expect(pressPull.faceIds.value).toEqual(["f-top", "f-side"]);
    expect(viewport.markFaces).toHaveBeenLastCalledWith("box", ["f-top", "f-side"]);
    pressPull.onFaceSelected(pick("f-top"));
    expect(pressPull.faceIds.value).toEqual(["f-side"]);
    pressPull.removeFace("f-side");
    expect(pressPull.bodyId.value).toBeNull();
    expect(viewport.clearMarkedFaces).toHaveBeenCalled();
    pressPull.onFaceSelected(pick("f-top"));
    pressPull.onFaceSelected(pick("f-a", "other"));
    expect(pressPull.bodyId.value).toBe("other");
    expect(pressPull.faceIds.value).toEqual(["f-a"]);
  });

  it("призрак следует за смещением со знаком и прячется при ошибке поля и выходе", async () => {
    const { pressPull, viewport } = setup();
    pressPull.enter();
    pressPull.onFaceSelected(pick("f-top"));
    await nextTick();
    expect(viewport.showPressPullPreview).toHaveBeenLastCalledWith(expect.objectContaining({ arrows: [expect.any(Object)] }), true);

    pressPull.distanceField.text.value = "-0.14/2";
    pressPull.distanceField.onInput();
    await nextTick();
    expect(pressPull.distanceField.value.value).toBeCloseTo(-0.07, 12);
    expect(viewport.showPressPullPreview).toHaveBeenLastCalledWith(expect.anything(), false);

    pressPull.distanceField.text.value = "0";
    pressPull.distanceField.onInput();
    await nextTick();
    expect(pressPull.canApply.value).toBe(false);
    expect(viewport.hidePressPullPreview).toHaveBeenCalled();

    pressPull.exit();
    expect(pressPull.faceIds.value).toEqual([]);
  });

  it("применяет сдвиг: исходное тело заменяется результатом", async () => {
    const { pressPull, meshes } = setup();
    pressPull.enter();
    pressPull.selectFaces("box", ["f-top"]);
    pressPull.distanceField.set(-0.07);
    await pressPull.apply();
    expect(executed).toEqual([{ bodyId: "box", faceNames: ["f-top"], distance: -0.07, newBody: false }]);
    expect(meshes.untrackMesh).toHaveBeenCalledWith("box");
    expect(meshes.trackMesh).toHaveBeenCalledWith("body-result", MESH);
    expect(pressPull.pressPullMode.value).toBe(false);
  });

  it("новое тело оставляет исходное, ошибка ядра остаётся в панели", async () => {
    const { pressPull, meshes } = setup();
    pressPull.enter();
    pressPull.selectFaces("box", ["f-top"]);
    pressPull.setNewBody(true);
    await pressPull.apply();
    expect(meshes.untrackMesh).not.toHaveBeenCalled();

    failure = new Error("Сдвиг грани внутрь не построился");
    pressPull.enter();
    pressPull.selectFaces("box", ["f-top"]);
    await pressPull.apply();
    expect(pressPull.error.value).toBe("Сдвиг грани внутрь не построился");
    expect(pressPull.pressPullMode.value).toBe(true);
  });
});
