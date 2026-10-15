import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import type { MeasureRef, MeasureResult } from "@/lib/measure";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { SelectionMode, ViewportRef } from "./types";
import { useMeasure } from "./useMeasure";

const measureBrowserShapes = vi.fn<(refs: MeasureRef[]) => Promise<MeasureResult>>();

vi.mock("./useBrowserGeometry", () => ({
  cloneBrowserWorkerInput: <T>(input: T): T => JSON.parse(JSON.stringify(input)),
  request: async (payload: { refs: MeasureRef[] }) => ({ measure: await measureBrowserShapes(payload.refs) }),
}));
vi.mock("@/composables/useDisplayNames", () => ({ useDisplayNames: () => ({ bodyLabel: (bodyId: string) => `Тело ${bodyId}` }) }));
vi.mock("@/composables/useToast", () => ({ toast: vi.fn() }));

const face = (bodyId: string, faceId: string): MeasureRef => ({ kind: "face", bodyId, faceId });

function plane(area: number): MeasureResult {
  return { items: [{ kind: "face", surface: "plane", area, centroid: [0, 0, 0], normal: [0, 0, 1], radius: null, center: null, axis: null }], pair: null };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function setup() {
  const viewport = { showMeasure: vi.fn(), setMeasureFilter: vi.fn(), clearHighlight: vi.fn() };
  const viewportRef = ref(viewport) as unknown as ViewportRef;
  const viewportSelectionMode = ref<SelectionMode>("face");
  const meshBodies = ref([{ body_id: "b1", mesh: {} }, { body_id: "b2", mesh: {} }]);
  const measure = useMeasure({ viewportRef, viewportSelectionMode, meshes: { meshBodies } as unknown as BodyMeshesApi });
  return { measure, viewport, viewportSelectionMode, meshBodies };
}

const settle = () => new Promise((done) => setTimeout(done, 0));

beforeEach(() => {
  measureBrowserShapes.mockReset();
});

describe("useMeasure", () => {
  it("вход и выход переключают выбор вьюпорта и чистят оверлей", () => {
    const { measure, viewport, viewportSelectionMode } = setup();
    measure.enter();
    expect(viewportSelectionMode.value).toBe("measure");
    expect(viewport.setMeasureFilter).toHaveBeenCalledWith("entity");
    measure.exit();
    expect(viewportSelectionMode.value).toBe("face");
    expect(viewport.showMeasure).toHaveBeenLastCalledWith([], null);
  });

  it("клик меряет выбранное, а строки панели подписаны телом", async () => {
    const { measure } = setup();
    measureBrowserShapes.mockResolvedValue(plane(40));
    measure.enter();
    measure.onPicked(face("b1", "f-1"));
    await vi.waitFor(() => expect(measure.result.value).not.toBeNull());
    expect(measureBrowserShapes).toHaveBeenCalledWith([face("b1", "f-1")]);
    expect(measure.groups.value[0].title).toBe("Грань — плоская · Тело b1");
    expect(measure.groups.value[0].rows[0].value).toBe("40.000 мм²");
  });

  it("поздний ответ на прежний выбор не перетирает свежий", async () => {
    const { measure } = setup();
    const slow = deferred<MeasureResult>();
    measureBrowserShapes.mockImplementation(async ([pick]) => (pick.kind === "face" && pick.faceId === "f-1" ? slow.promise : plane(8)));
    measure.enter();
    measure.onPicked(face("b1", "f-1"));
    measure.onPicked(face("b1", "f-1"));
    measure.onPicked(face("b1", "f-2"));
    await vi.waitFor(() => expect(measure.result.value?.items[0]).toMatchObject({ area: 8 }));
    slow.resolve(plane(40));
    await settle();
    expect(measure.result.value?.items[0]).toMatchObject({ area: 8 });
  });

  it("исчезнувшее тело уходит из измерения", async () => {
    const { measure, meshBodies } = setup();
    measureBrowserShapes.mockResolvedValue(plane(1));
    measure.enter();
    measure.onPicked(face("b1", "f-1"));
    measure.onPicked(face("b2", "f-1"));
    meshBodies.value = [{ body_id: "b2", mesh: {} }];
    await nextTick();
    expect(measure.picks.value).toEqual([face("b2", "f-1")]);
  });

  it("материал задаёт плотность, ручная плотность переключает на свою", () => {
    const { measure } = setup();
    measure.setMaterial("aluminium");
    expect(measure.density.value).toBe(2.7);
    measure.setDensity(2.8);
    expect(measure.materialId.value).toBe(measure.customMaterialId);
  });

  it("ошибка ядра видна в панели", async () => {
    const { measure } = setup();
    measureBrowserShapes.mockRejectedValue(new Error("Грань «f-1» больше не существует в теле."));
    measure.enter();
    measure.onPicked(face("b1", "f-1"));
    await vi.waitFor(() => expect(measure.error.value).toMatch(/больше не существует/));
    expect(measure.loading.value).toBe(false);
  });
});
