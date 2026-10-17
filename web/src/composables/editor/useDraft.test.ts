import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import type { MeshData } from "@/types/api";
import type { SelectionMode } from "./types";
import { useDraft } from "./useDraft";

const executed: unknown[] = [];
const failure: { message: string | null } = { message: null };
const load = vi.fn(async () => undefined);
const clearSelection = vi.fn();

vi.mock("@/composables/shared/useDocument", () => ({ useDocument: () => ({ document: ref({ version: 4 }), load, markDirty: vi.fn() }) }));
vi.mock("@/composables/shared/useSelection", () => ({ useSelection: () => ({ clearSelection }) }));
vi.mock("@/composables/useParameters", () => ({ useParameters: () => ({ parameters: ref([]) }) }));
vi.mock("@/composables/shared/useUndoRedo", () => ({
  useUndoRedo: () => ({ execute: async (command: { perform: () => Promise<void> }) => command.perform() }),
}));
vi.mock("@/core/commands/BrowserDraftCommand", () => ({
  BrowserDraftCommand: class {
    private result: unknown = null;
    constructor(_projectId: string, private feature: { bodyId: string }) {}
    async perform() {
      if (failure.message) throw new Error(failure.message);
      executed.push(this.feature);
      this.result = { bodyId: "body-result", mesh: MESH, hiddenBodyIds: [this.feature.bodyId] };
    }
    getResult() {
      return this.result;
    }
  },
}));

type Point = [number, number, number];

function meshOf(faces: { id: string; triangles: [Point, Point, Point][]; edges: string[] }[], edges: { id: string; from: Point; to: Point }[]): MeshData {
  const vertices: number[] = [];
  const indices: number[] = [];
  const faceTriangleMap: string[] = [];
  for (const face of faces) {
    for (const triangle of face.triangles) {
      const base = vertices.length / 3;
      triangle.forEach((point) => vertices.push(...point));
      indices.push(base, base + 1, base + 2);
      faceTriangleMap.push(face.id);
    }
  }
  return {
    vertices,
    indices,
    face_triangle_map: faceTriangleMap,
    brep_topo: {
      faces: faces.map((face) => ({ face_id: face.id, edges: face.edges })),
      edges: edges.map((edge) => ({ edge_id: edge.id, vertices: [], polyline: [...edge.from, ...edge.to] })),
    },
    bbox: { min: [0, 0, 0], max: [6, 1, 2] },
  } as unknown as MeshData;
}

const quad = (a: Point, b: Point, c: Point, d: Point): [Point, Point, Point][] => [[a, b, c], [a, c, d]];

const MESH = meshOf(
  [
    { id: "f-bottom", triangles: quad([0, 0, 0], [0, 1, 0], [2, 1, 0], [2, 0, 0]), edges: ["e-bw"] },
    { id: "f-wall", triangles: quad([2, 0, 0], [2, 1, 0], [2, 1, 1], [2, 0, 1]), edges: ["e-bw", "e-ww"] },
    { id: "f-wall2", triangles: quad([2, 0, 1], [2, 1, 1], [2.02, 1, 2], [2.02, 0, 2]), edges: ["e-ww"] },
    { id: "f-bent", triangles: [[[5, 0, 0], [6, 0, 0], [5, 1, 0]], [[6, 0, 0], [6, 1, 1], [5, 1, 0]]], edges: [] },
  ],
  [
    { id: "e-bw", from: [2, 0, 0], to: [2, 1, 0] },
    { id: "e-ww", from: [2, 0, 1], to: [2, 1, 1] },
  ],
);

function setup() {
  const viewport = { clearHighlight: vi.fn(), markFaces: vi.fn(), clearMarkedFaces: vi.fn() };
  const meshes = { meshBodies: ref([{ body_id: "box", mesh: MESH }]), untrackMesh: vi.fn(), trackMesh: vi.fn() };
  const selectionMode = ref<SelectionMode>("edge");
  const draft = effectScope().run(() => useDraft({
    projectId: "p",
    viewportRef: ref(viewport) as never,
    viewportSelectionMode: selectionMode,
    meshes: meshes as never,
  }))!;
  return { draft, viewport, meshes, selectionMode };
}

const pick = (faceId: string, bodyId = "box") => ({ bodyId, faceId, brepTopo: MESH.brep_topo });

beforeEach(() => {
  executed.length = 0;
  failure.message = null;
  vi.clearAllMocks();
});

describe("useDraft", () => {
  it("вне режима уклона клик по грани не перехватывает", () => {
    const { draft } = setup();
    expect(draft.onFaceSelected(pick("f-wall"))).toBe(false);
  });

  it("касательная цепочка берёт и снимает гладких соседей одним кликом", () => {
    const { draft, viewport, selectionMode } = setup();
    draft.enter();
    expect(selectionMode.value).toBe("face");
    expect(draft.onFaceSelected(pick("f-wall"))).toBe(true);
    expect(draft.faceIds.value).toEqual(["f-wall", "f-wall2"]);
    expect(viewport.markFaces).toHaveBeenLastCalledWith("box", ["f-wall", "f-wall2"]);
    draft.onFaceSelected(pick("f-wall2"));
    expect(draft.faceIds.value).toEqual([]);
    expect(draft.bodyId.value).toBeNull();
  });

  it("без цепочки клик берёт одну грань, крестик в списке снимает её точечно", () => {
    const { draft } = setup();
    draft.enter();
    draft.setTangentChain(false);
    draft.onFaceSelected(pick("f-wall"));
    draft.onFaceSelected(pick("f-wall2"));
    expect(draft.faceIds.value).toEqual(["f-wall", "f-wall2"]);
    draft.removeFace("f-wall");
    expect(draft.faceIds.value).toEqual(["f-wall2"]);
    expect(draft.faceRows.value.map((row) => row.faceId)).toEqual(["f-wall2"]);
  });

  it("нейтраль по грани: неплоская отклоняется, плоская выбирается и сама под уклон не идёт", () => {
    const { draft } = setup();
    draft.enter();
    draft.startNeutralFacePick();
    expect(draft.canApply.value).toBe(false);
    draft.onFaceSelected(pick("f-bent"));
    expect(draft.hint.value).toMatch(/не плоская/);
    expect(draft.neutralFace.value).toBeNull();
    draft.onFaceSelected(pick("f-bottom"));
    expect(draft.neutralFace.value).toEqual({ bodyId: "box", faceId: "f-bottom" });
    expect(draft.pickingNeutral.value).toBe(false);
    draft.onFaceSelected(pick("f-bottom"));
    expect(draft.faceIds.value).toEqual([]);
    expect(draft.hint.value).toMatch(/Нейтральная грань не наклоняется/);
    draft.onFaceSelected(pick("f-wall"));
    expect(draft.canApply.value).toBe(true);
  });

  it("угол принимает выражение с единицами и отклоняет 90° и больше", () => {
    const { draft } = setup();
    draft.enter();
    draft.onFaceSelected(pick("f-wall"));
    draft.setAngleText("0.1 rad");
    expect(draft.angle.value.value).toBeCloseTo(5.7296, 3);
    draft.setAngleText("95");
    expect(draft.angle.error.value).toMatch(/меньше 90°/);
    expect(draft.canApply.value).toBe(false);
  });

  it("применение отправляет признак уклона, подменяет тело и выходит из режима", async () => {
    const { draft, meshes } = setup();
    draft.enter();
    draft.startNeutralFacePick();
    draft.onFaceSelected(pick("f-bottom"));
    draft.onFaceSelected(pick("f-wall"));
    draft.setReverse(true);
    await draft.apply();
    expect(executed).toEqual([{
      bodyId: "box", faceNames: ["f-wall", "f-wall2"], neutral: { kind: "face", faceId: "f-bottom" }, angleDeg: 3, reverse: true,
    }]);
    expect(meshes.untrackMesh).toHaveBeenCalledWith("box");
    expect(meshes.trackMesh).toHaveBeenCalledWith("body-result", MESH);
    expect(draft.draftMode.value).toBe(false);
  });

  it("отказ ядра показывается в панели, режим и выбор остаются", async () => {
    const { draft } = setup();
    draft.enter();
    draft.onFaceSelected(pick("f-wall"));
    failure.message = "Уклон 60° не строится на этом теле";
    await draft.apply();
    expect(draft.error.value).toBe("Уклон 60° не строится на этом теле");
    expect(draft.draftMode.value).toBe(true);
    expect(draft.faceIds.value).toEqual(["f-wall", "f-wall2"]);
  });
});
