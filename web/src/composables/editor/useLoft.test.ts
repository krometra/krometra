import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { MeshData, SketchEntity, TimelineEntry } from "@/types/api";
import { useLoft } from "./useLoft";

const executed: { profiles: string[]; options: Record<string, unknown> }[] = [];
const selectedFeatureId = ref<string | null>(null);
const load = vi.fn(async () => undefined);
const markDirty = vi.fn();
const hidePreview = vi.fn();
const toast = vi.fn();

const timeline: TimelineEntry[] = [
  { id: "t1", kind: "sketch", sketch_id: "s1", label: "Эскиз 1", timestamp: "", status: "ok" },
  { id: "t2", kind: "sketch", sketch_id: "s2", label: "Эскиз 2", timestamp: "", status: "ok" },
  { id: "t3", kind: "sketch", sketch_id: "s3", label: "Эскиз 3", timestamp: "", status: "ok" },
];

vi.mock("@/composables/shared/useDocument", () => ({
  useDocument: () => ({ document: ref({ version: 4, timeline, components: {}, metadata: {} }), version: ref(4), load, markDirty }),
}));
vi.mock("@/composables/shared/useSelection", () => ({ useSelection: () => ({ selectedFeatureId }) }));
vi.mock("@/composables/shared/useUndoRedo", () => ({
  useUndoRedo: () => ({ execute: async (command: { perform: () => Promise<void> }) => command.perform() }),
}));
vi.mock("@/composables/useToast", () => ({ toast: (...args: unknown[]) => toast(...args) }));
vi.mock("./useLoftPreview", () => ({ useLoftPreview: () => ({ hide: hidePreview }) }));
vi.mock("@/core/commands/BrowserLoftCommand", () => ({
  BrowserLoftCommand: class {
    constructor(_projectId: string, private profiles: string[], private options: Record<string, unknown>) {}
    async perform() {
      executed.push({ profiles: this.profiles, options: this.options });
    }
    getResult() {
      return { bodyId: "body-loft", mesh: MESH };
    }
  },
}));

const MESH: MeshData = { vertices: [], indices: [], face_triangle_map: [], brep_topo: { faces: [], edges: [] }, bbox: { min: [0, 0, 0], max: [1, 1, 1] } };

const square = (half: number): SketchEntity[] => [{ id: `sq${half}`, type: "rectangle", corner1: { x: -half, y: -half }, corner2: { x: half, y: half } }];

function setup(sketchCount = 3) {
  const sketches = ref([
    { id: "s1", type: "sketch", plane: "XY", plane_offset: 0, entities: square(10) },
    { id: "s2", type: "sketch", plane: "XY", plane_offset: 15, entities: square(5) },
    { id: "s3", type: "sketch", plane: "XY", plane_offset: 30, entities: square(8) },
  ].slice(0, sketchCount));
  const model = { sketches, timelineEntries: ref(timeline), sketchHasFeature: () => false };
  const meshes = { meshBodies: ref([]), untrackMesh: vi.fn(), trackMesh: vi.fn() };
  const scope = effectScope();
  const loft = scope.run(() => useLoft({ projectId: "p", viewportRef: ref(undefined) as never, meshes: meshes as never, model: model as never }))!;
  return { loft, meshes };
}

beforeEach(() => {
  executed.length = 0;
  selectedFeatureId.value = null;
  vi.clearAllMocks();
});

describe("useLoft", () => {
  it("без двух эскизов не открывает панель и объясняет почему", () => {
    const { loft } = setup(1);
    loft.enter();
    expect(loft.loftMode.value).toBe(false);
    expect(toast).toHaveBeenCalledOnce();
  });

  it("берет профили по умолчанию, добавляет эскиз кликом в дереве и переставляет", async () => {
    const { loft } = setup();
    loft.enter();
    expect(loft.profileSketchIds.value).toEqual(["s1", "s2", "s3"]);
    loft.removeProfile(1);
    expect(loft.addOptions.value.map((option) => option.value)).toEqual(["s2"]);
    selectedFeatureId.value = "t2";
    await nextTick();
    expect(loft.profileSketchIds.value).toEqual(["s1", "s3", "s2"]);
    loft.moveProfile(2, -1);
    expect(loft.profiles.value.map((profile) => profile.label)).toEqual(["Эскиз 1", "Эскиз 2", "Эскиз 3"]);
    expect(loft.setupError.value).toBeNull();
  });

  it("строит лофт по выбранным профилям и закрывает панель", async () => {
    const { loft, meshes } = setup();
    loft.enter();
    loft.configure({ profileSketchIds: ["s3", "s1"], ruled: true });
    await loft.apply();
    expect(executed).toHaveLength(1);
    expect(executed[0].profiles).toEqual(["s3", "s1"]);
    expect(executed[0].options).toMatchObject({ ruled: true, operation: "new_body", targetBodyId: null });
    expect((executed[0].options.sections as { planeOffset: number }[]).map((section) => section.planeOffset)).toEqual([30, 0]);
    expect(meshes.trackMesh).toHaveBeenCalledWith("body-loft", MESH);
    expect(loft.loftMode.value).toBe(false);
    expect(hidePreview).toHaveBeenCalled();
  });

  it("не строит лофт с ошибкой настроек и показывает ее", async () => {
    const { loft } = setup();
    loft.enter();
    loft.configure({ profileSketchIds: ["s1"] });
    await loft.apply();
    expect(executed).toHaveLength(0);
    expect(loft.error.value).toContain("минимум по двум");
  });
});
