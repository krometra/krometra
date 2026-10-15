import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { MeshData } from "@/types/api";
import type { SelectionMode } from "./types";
import { useMirror } from "./useMirror";

const executed: { body: string; plane: unknown; merge: boolean }[] = [];
const load = vi.fn(async () => undefined);
const selectFace = vi.fn();

vi.mock("@/composables/shared/useDocument", () => ({ useDocument: () => ({ document: ref({ version: 4 }), load }) }));
vi.mock("@/composables/shared/useSelection", () => ({ useSelection: () => ({ selectFace }) }));
vi.mock("@/composables/shared/useUndoRedo", () => ({
  useUndoRedo: () => ({ execute: async (command: { perform: () => Promise<void> }) => command.perform() }),
}));
vi.mock("@/core/commands/BrowserMirrorCommand", () => ({
  BrowserMirrorCommand: class {
    private result: unknown = null;
    constructor(_projectId: string, private body: string, private plane: unknown, private merge: boolean) {}
    async perform() {
      executed.push({ body: this.body, plane: this.plane, merge: this.merge });
      this.result = { bodyId: "body-result", mesh: MESH, hiddenBodyIds: this.merge ? [this.body] : [] };
    }
    getResult() {
      return this.result;
    }
  },
}));

const MESH: MeshData = {
  vertices: [10, 0, 0, 10, 4, 0, 10, 0, 2, 0, 0, 0, 5, 0, 0, 0, 3, 3, 0, 0, 5],
  indices: [0, 1, 2, 3, 4, 5, 3, 5, 6],
  face_triangle_map: ["f-flat", "f-bent", "f-bent"],
  brep_topo: { faces: [{ face_id: "f-flat", edges: [] }, { face_id: "f-bent", edges: [] }], edges: [] },
  bbox: { min: [0, 0, 0], max: [10, 4, 3] },
};

function setup() {
  const viewport = { clearHighlight: vi.fn(), showMirrorPreview: vi.fn(), hideMirrorPreview: vi.fn() };
  const meshes = { meshBodies: ref([{ body_id: "box", mesh: MESH }]), untrackMesh: vi.fn(), trackMesh: vi.fn() };
  const selectionMode = ref<SelectionMode>("edge");
  const scope = effectScope();
  const mirror = scope.run(() => useMirror({
    projectId: "p",
    viewportRef: ref(viewport) as never,
    viewportSelectionMode: selectionMode,
    meshes: meshes as never,
  }))!;
  return { mirror, viewport, meshes, selectionMode };
}

const pick = (faceId: string) => ({ bodyId: "box", faceId, brepTopo: MESH.brep_topo });

beforeEach(() => {
  executed.length = 0;
  vi.clearAllMocks();
});

describe("useMirror", () => {
  it("вне режима зеркала клик по грани не перехватывает", () => {
    const { mirror } = setup();
    expect(mirror.onFaceSelected(pick("f-flat"))).toBe(false);
    expect(selectFace).not.toHaveBeenCalled();
  });

  it("клик по грани выбирает тело и показывает призрак отражения через базовую плоскость", async () => {
    const { mirror, viewport, selectionMode } = setup();
    mirror.enter();
    expect(selectionMode.value).toBe("face");
    expect(mirror.onFaceSelected(pick("f-bent"))).toBe(true);
    await nextTick();

    expect(mirror.bodyId.value).toBe("box");
    expect(mirror.canApply.value).toBe(true);
    expect(viewport.showMirrorPreview).toHaveBeenLastCalledWith("box", { origin: [0, 0, 0], normal: [1, 0, 0] });

    mirror.selectBasePlane("XY");
    mirror.setOffset(5);
    await nextTick();
    expect(viewport.showMirrorPreview).toHaveBeenLastCalledWith("box", { origin: [0, 0, 5], normal: [0, 0, 1] });
  });

  it("в режиме грани берёт только плоскую грань и объясняет отказ", async () => {
    const { mirror, viewport } = setup();
    mirror.enter();
    mirror.selectFacePlane();
    mirror.onFaceSelected(pick("f-bent"));
    await nextTick();
    expect(mirror.faceId.value).toBeNull();
    expect(mirror.faceHint.value).toContain("не плоская");
    expect(mirror.canApply.value).toBe(false);
    expect(viewport.hideMirrorPreview).toHaveBeenCalled();

    mirror.onFaceSelected(pick("f-flat"));
    await nextTick();
    expect(mirror.faceId.value).toBe("f-flat");
    expect(mirror.faceHint.value).toBeNull();
    const [body, frame] = viewport.showMirrorPreview.mock.calls.at(-1)!;
    expect(body).toBe("box");
    expect(Math.abs(frame.normal[0])).toBeCloseTo(1, 9);
    expect(frame.origin[0]).toBeCloseTo(10, 9);
  });

  it("применение строит зеркало, прячет поглощённое тело и закрывает панель", async () => {
    const { mirror, meshes, viewport } = setup();
    mirror.enter();
    mirror.setMerge(true);
    mirror.onFaceSelected(pick("f-flat"));
    await mirror.apply();

    expect(executed).toEqual([{ body: "box", plane: { kind: "base", plane: "YZ", offset: 0 }, merge: true }]);
    expect(meshes.untrackMesh).toHaveBeenCalledWith("box");
    expect(load).toHaveBeenCalledWith("p");
    expect(meshes.trackMesh).toHaveBeenCalledWith("body-result", MESH);
    expect(mirror.mirrorMode.value).toBe(false);
    expect(viewport.hideMirrorPreview).toHaveBeenCalled();
  });

  it("сброс выделения забывает выбранное тело", () => {
    const { mirror } = setup();
    mirror.enter();
    mirror.onFaceSelected(pick("f-flat"));
    mirror.onSelectionCleared();
    expect(mirror.bodyId.value).toBeNull();
    expect(mirror.canApply.value).toBe(false);
  });
});
