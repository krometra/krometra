import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, nextTick, ref } from "vue";
import type { MeshData } from "@/types/api";
import { meshWorkPlaneGeometry } from "@/lib/workPlaneMesh";
import type { WorkPlaneDefinition } from "@/lib/workPlane";
import type { SelectionMode } from "./types";
import { useWorkPlaneTool } from "./useWorkPlaneTool";

vi.mock("@/composables/useDisplayNames", () => ({ useDisplayNames: () => ({ sketchLabel: (id: string) => `Эскиз ${id}` }) }));
vi.mock("@/composables/useParameters", () => ({ useParameters: () => ({ parameters: ref([]) }) }));

const MESH = {
  vertices: [0, 0, 10, 20, 0, 10, 20, 10, 10, 0, 10, 10, 0, 0, 0, 20, 0, 0, 20, 10, 0],
  indices: [0, 1, 2, 0, 2, 3, 4, 6, 5],
  face_triangle_map: ["f-top", "f-top", "f-bottom"],
  bbox: { min: [0, 0, 0], max: [20, 10, 10] },
  brep_topo: {
    faces: [{ face_id: "f-top", edges: [] }, { face_id: "f-bottom", edges: [] }],
    edges: [
      { edge_id: "e-x", vertices: [], polyline: [0, 0, 10, 20, 0, 10] },
      { edge_id: "e-y", vertices: [], polyline: [0, 0, 10, 0, 10, 10] },
      { edge_id: "e-z", vertices: [], polyline: [20, 0, 0, 20, 0, 10] },
      { edge_id: "e-back", vertices: [], polyline: [0, 10, 10, 20, 10, 10] },
      { edge_id: "e-arc", vertices: [], polyline: [0, 0, 0, 1, 1, 0, 0, 2, 0] },
    ],
  },
} as MeshData;

function setup() {
  const viewport = {
    clearHighlight: vi.fn(),
    setMeasureFilter: vi.fn(),
    showMeasure: vi.fn(),
    showWorkPlanePreview: vi.fn(),
    hideWorkPlanePreview: vi.fn(),
  };
  const meshes = { meshBodies: ref([{ body_id: "b1", mesh: MESH }]) };
  const selectionMode = ref<SelectionMode>("face");
  const saved: [string | null, WorkPlaneDefinition][] = [];
  const save = vi.fn(async (planeId: string | null, definition: WorkPlaneDefinition) => {
    saved.push([planeId, definition]);
    return planeId ?? "plane-new";
  });
  const scope = effectScope();
  const tool = scope.run(() => useWorkPlaneTool({
    viewportRef: ref(viewport) as never,
    viewportSelectionMode: selectionMode,
    meshes: meshes as never,
    model: { sketches: computed(() => [{ id: "s1", entities: [{ id: "l1", type: "line" }, { id: "c1", type: "circle" }] }]) } as never,
    geometry: () => meshWorkPlaneGeometry((bodyId) => (bodyId === "b1" ? MESH : undefined), {}),
    definitionOf: (planeId) => (planeId === "plane-1" ? { kind: "offset", reference: { kind: "base", plane: "YZ" }, distance: 7 } : null),
    save,
  }))!;
  return { tool, viewport, selectionMode, saved, save };
}

beforeEach(() => vi.clearAllMocks());

describe("useWorkPlaneTool", () => {
  it("вход ждёт клика по грани, по умолчанию — смещение от XY с призраком", async () => {
    const { tool, viewport, selectionMode } = setup();
    tool.enter();
    await nextTick();
    expect(selectionMode.value).toBe("pick");
    expect(tool.picking.value).toBe("reference");
    expect(tool.preview.value.frame?.origin).toEqual([0, 0, 10]);
    expect(viewport.showWorkPlanePreview).toHaveBeenCalled();
    expect(tool.canApply.value).toBe(true);
  });

  it("клик по плоской грани задаёт опору, по ребру — не подходит", () => {
    const { tool, selectionMode } = setup();
    tool.enter();
    tool.onPicked({ kind: "edge", bodyId: "b1", edgeId: "e-x" });
    expect(tool.pickHint.value).toMatch(/Не подходит/);
    tool.onPicked({ kind: "face", bodyId: "b1", faceId: "f-top" });
    expect(tool.reference.value).toEqual({ kind: "face", bodyId: "b1", faceName: "f-top" });
    expect(tool.picking.value).toBeNull();
    expect(selectionMode.value).toBe("face");
    expect(tool.preview.value.frame?.origin).toEqual([0, 0, 20]);
  });

  it("под углом: ось — прямое ребро или отрезок эскиза, кривое ребро отклоняется", () => {
    const { tool } = setup();
    tool.enter();
    tool.setKind("angle");
    expect(tool.picking.value).toBe("axis");
    expect(tool.definition.value).toBeNull();
    tool.onPicked({ kind: "edge", bodyId: "b1", edgeId: "e-arc" });
    expect(tool.axis.value).toBeNull();
    tool.onPicked({ kind: "edge", bodyId: "b1", edgeId: "e-x" });
    expect(tool.axis.value).toEqual({ kind: "edge", bodyId: "b1", edgeName: "e-x" });
    expect(tool.preview.value.frame?.origin).toEqual([10, 0, 10]);
    expect(tool.sketchLineOptions.value).toEqual([{ value: "s1:l1", label: "Эскиз s1 · отрезок 1" }]);
    tool.selectSketchLine("s1:l1");
    expect(tool.axis.value).toEqual({ kind: "sketch_line", sketchId: "s1", entityId: "l1" });
    expect(tool.reference.value).toEqual({ kind: "sketch", sketchId: "s1" });
  });

  it("три вершины копятся и закрывают выбор, средняя плоскость ждёт двух граней", () => {
    const { tool } = setup();
    tool.enter();
    tool.setKind("three_points");
    tool.onPicked({ kind: "vertex", bodyId: "b1", point: [0, 0, 10] });
    tool.onPicked({ kind: "vertex", bodyId: "b1", point: [20, 0, 10] });
    expect(tool.picking.value).toBe("points");
    tool.onPicked({ kind: "vertex", bodyId: "b1", point: [0, 10, 10] });
    expect(tool.points.value).toHaveLength(3);
    expect(tool.picking.value).toBeNull();
    expect(tool.preview.value.frame?.n).toEqual([0, 0, 1]);

    tool.setKind("midplane");
    tool.onPicked({ kind: "face", bodyId: "b1", faceId: "f-top" });
    tool.onPicked({ kind: "face", bodyId: "b1", faceId: "f-bottom" });
    expect(tool.preview.value.frame?.origin).toEqual([0, 0, 5]);
  });

  it("правка подставляет определение плоскости и сохраняет его по id", async () => {
    const { tool, saved } = setup();
    tool.editPlane("plane-1");
    expect(tool.editingId.value).toBe("plane-1");
    expect(tool.distanceField.text.value).toBe("7");
    tool.distanceField.text.value = "12";
    tool.distanceField.onInput();
    await tool.apply();
    expect(saved).toEqual([["plane-1", { kind: "offset", reference: { kind: "base", plane: "YZ" }, distance: 12 }]]);
    expect(tool.active.value).toBe(false);
  });

  it("ошибка сохранения остаётся в панели", async () => {
    const { tool, save } = setup();
    save.mockRejectedValueOnce(new Error("Опоры рабочей плоскости должны принадлежать одному телу."));
    tool.enter();
    await tool.apply();
    expect(tool.active.value).toBe(true);
    expect(tool.error.value).toMatch(/одному телу/);
  });
});
