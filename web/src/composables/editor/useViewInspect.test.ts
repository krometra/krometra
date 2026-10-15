import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { ClipPlane } from "@/lib/sectionPlane";
import type { LookAtTarget } from "@/lib/lookAtView";
import type { ViewportRef } from "./types";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/composables/useToast", () => ({ toast }));

const { useViewInspect } = await import("./useViewInspect");
const { useSelection } = await import("@/composables/shared/useSelection");

const TOP_FACE = { center: [0, 0, 20] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radius: 10 };

function fakeViewport(camera = { x: 30, y: -30, z: 25 }) {
  const sections: (ClipPlane | null)[] = [];
  const looks: LookAtTarget[] = [];
  const viewport = {
    getCameraState: () => ({ position: camera, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } }),
    modelBounds: () => ({ min: [-10, -10, 0], max: [10, 10, 20] }),
    faceFrame: (_bodyId: string, faceId: string | number) => (faceId === "f-top" ? TOP_FACE : null),
    setSection: (plane: ClipPlane) => sections.push(plane),
    clearSection: () => sections.push(null),
    lookAt: (target: LookAtTarget) => looks.push(target),
    lookAtFace: (_bodyId: string, faceId: string | number) => {
      if (faceId !== "f-top") return false;
      looks.push(TOP_FACE);
      return true;
    },
  };
  return { ref: ref(viewport) as unknown as ViewportRef, sections, looks };
}

const keeps = (plane: ClipPlane | null | undefined, point: number[]) =>
  plane !== null && plane !== undefined && plane.normal.reduce((sum, n, axis) => sum + n * point[axis], plane.constant) >= 0;

beforeEach(() => {
  toast.mockClear();
  useSelection().clearSelection();
});

describe("useViewInspect: сечение", () => {
  it("кнопка включает сечение XY посередине модели, срез смотрит на камеру сверху", () => {
    const viewport = fakeViewport();
    const inspect = useViewInspect(viewport.ref);

    inspect.section.toggle();

    expect(inspect.section.active.value).toBe(true);
    expect(inspect.section.source.value).toBe("XY");
    expect(inspect.section.offset.value).toBe(10);
    expect(keeps(viewport.sections.at(-1), [0, 0, 5])).toBe(true);
    expect(keeps(viewport.sections.at(-1), [0, 0, 15])).toBe(false);
  });

  it("камера снизу получает перевёрнутую сторону", () => {
    const viewport = fakeViewport({ x: 0, y: 0, z: -40 });
    const inspect = useViewInspect(viewport.ref);

    inspect.section.setBase("XY");

    expect(inspect.section.flipped.value).toBe(true);
    expect(keeps(viewport.sections.at(-1), [0, 0, 15])).toBe(true);
  });

  it("смещение зажимается в габарит, переворот меняет оставшуюся сторону", () => {
    const viewport = fakeViewport();
    const inspect = useViewInspect(viewport.ref);
    inspect.section.setBase("XY");

    inspect.section.setOffset(99);
    expect(inspect.section.offset.value).toBe(20);
    inspect.section.setOffset(4);
    inspect.section.flip();

    expect(keeps(viewport.sections.at(-1), [0, 0, 5])).toBe(true);
    expect(keeps(viewport.sections.at(-1), [0, 0, 3])).toBe(false);
  });

  it("по грани: смещение отсчитывается от грани внутрь тела", () => {
    const viewport = fakeViewport();
    const inspect = useViewInspect(viewport.ref);

    inspect.section.setFace("body-1", "f-top");

    expect(inspect.section.source.value).toBe("face");
    expect(inspect.section.range.value).toEqual({ min: -20, max: 0 });
    expect(keeps(viewport.sections.at(-1), [0, 0, 5])).toBe(true);
  });

  it("неплоская грань не включает сечение и объясняет почему", () => {
    const viewport = fakeViewport();
    const inspect = useViewInspect(viewport.ref);

    inspect.section.setFace("body-1", "f-cyl");

    expect(inspect.section.active.value).toBe(false);
    expect(viewport.sections).toEqual([]);
    expect(toast).toHaveBeenCalledOnce();
  });

  it("Esc сначала закрывает меню, потом сечение, потом отдаёт клавишу дальше", () => {
    const viewport = fakeViewport();
    const inspect = useViewInspect(viewport.ref);
    inspect.section.setBase("YZ");
    inspect.openPlaneMenu({ clientX: 5, clientY: 6 } as MouseEvent, "XZ");

    expect(inspect.dismiss()).toBe(true);
    expect(inspect.menu.value).toBeNull();
    expect(inspect.section.active.value).toBe(true);
    expect(inspect.dismiss()).toBe(true);
    expect(inspect.section.active.value).toBe(false);
    expect(viewport.sections.at(-1)).toBeNull();
    expect(inspect.dismiss()).toBe(false);
  });
});

describe("useViewInspect: вид по нормали", () => {
  it("кнопка смотрит на выбранную грань", () => {
    const viewport = fakeViewport();
    const inspect = useViewInspect(viewport.ref);
    useSelection().selectFace("body-1", "f-top", { faces: [], edges: [] });

    inspect.lookAtSelection();

    expect(viewport.looks).toEqual([TOP_FACE]);
  });

  it("без грани, но с сечением смотрит на срез со стороны отсечённой части", () => {
    const viewport = fakeViewport();
    const inspect = useViewInspect(viewport.ref);
    inspect.section.setBase("XZ");

    inspect.lookAtSelection();

    const look = viewport.looks[0];
    const clip = viewport.sections.at(-1)!;
    expect(look.normal.map((n, axis) => n + clip.normal[axis])).toEqual([0, 0, 0]);
    expect(look.center[1]).toBeCloseTo(0);
  });

  it("без грани и сечения подсказывает, что выбрать", () => {
    const viewport = fakeViewport();
    useViewInspect(viewport.ref).lookAtSelection();
    expect(viewport.looks).toEqual([]);
    expect(toast).toHaveBeenCalledOnce();
  });

  it("контекстное меню грани и плоскости ведёт к виду по нормали и сечению", () => {
    const viewport = fakeViewport();
    const inspect = useViewInspect(viewport.ref);

    inspect.openFaceMenu({ bodyId: "body-1", faceId: "f-top", x: 1, y: 2 });
    inspect.menu.value!.items.find((item) => item.label === "Вид по нормали")!.action();
    inspect.openPlaneMenu({ clientX: 1, clientY: 2 } as MouseEvent, "YZ");
    inspect.menu.value!.items.find((item) => item.label === "Вид по нормали")!.action();
    inspect.menu.value!.items.find((item) => item.label === "Сечение по плоскости")!.action();

    expect(viewport.looks[0]).toEqual(TOP_FACE);
    expect(viewport.looks[1].normal).toEqual([1, 0, 0]);
    expect(inspect.section.source.value).toBe("YZ");
  });
});
