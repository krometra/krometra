import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { QUALITY_PRESETS } from "@/lib/meshQuality";
import type { ExportApi, ExportTarget } from "./useExport";
import { useExportQuality } from "./useExportQuality";
import { estimateSummary, useMeshExportDialog } from "./useMeshExportDialog";

function fakeExportApi(estimate: (bodyIds: string[] | null, quality: { tolerance: number }) => Promise<number>) {
  const meshTarget = ref<ExportTarget<"stl" | "3mf"> | null>(null);
  return {
    meshTarget,
    estimateTriangles: vi.fn(estimate),
    download: vi.fn(() => Promise.resolve()),
    closeMeshExport: () => {
      meshTarget.value = null;
    },
  };
}

function setup(estimate = (_: string[] | null, quality: { tolerance: number }) => Promise.resolve(Math.round(1 / quality.tolerance))) {
  const api = fakeExportApi(estimate);
  const scope = effectScope();
  const dialog = scope.run(() => useMeshExportDialog(api as unknown as ExportApi))!;
  return { api, dialog, scope };
}

async function settle() {
  await nextTick();
  await vi.advanceTimersByTimeAsync(300);
}

beforeEach(() => {
  vi.useFakeTimers();
  useExportQuality().choice.value = { preset: "normal", custom: { ...QUALITY_PRESETS.normal } };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("estimateSummary", () => {
  it("для STL добавляет размер бинарного файла", () => {
    expect(estimateSummary(1000, "stl")).toMatch(/^Треугольников: 1\s000 · файл ≈ 48\.9 КБ$/);
    expect(estimateSummary(12, "3mf")).toBe("Треугольников: 12");
  });
});

describe("useMeshExportDialog", () => {
  it("оценивает сетку выбранных тел с текущим пресетом", async () => {
    const { api, dialog, scope } = setup();
    api.meshTarget.value = { format: "3mf", bodyIds: ["b1"] };
    await settle();
    expect(api.estimateTriangles).toHaveBeenCalledWith(["b1"], QUALITY_PRESETS.normal);
    expect(dialog.estimateText.value).toBe("Треугольников: 100");

    dialog.preset.value = "draft";
    await settle();
    expect(dialog.estimateText.value).toBe("Треугольников: 10");
    scope.stop();
  });

  it("не показывает устаревшую оценку после смены качества", async () => {
    const resolvers: ((count: number) => void)[] = [];
    const { api, dialog, scope } = setup(() => new Promise((resolve) => resolvers.push(resolve)));
    api.meshTarget.value = { format: "stl", bodyIds: null };
    await settle();
    dialog.preset.value = "high";
    await settle();
    resolvers[1](500);
    resolvers[0](7);
    await settle();
    expect(dialog.estimateText.value).toContain("Треугольников: 500");
    scope.stop();
  });

  it("неверный свой допуск блокирует оценку и скачивание", async () => {
    const { api, dialog, scope } = setup();
    dialog.choice.value = { preset: "custom", custom: { tolerance: 0, angleDeg: 10 } };
    api.meshTarget.value = { format: "stl", bodyIds: null };
    await settle();
    expect(api.estimateTriangles).not.toHaveBeenCalled();
    expect(dialog.estimateText.value).toContain("Линейный допуск");
    dialog.confirm();
    expect(api.download).not.toHaveBeenCalled();
    scope.stop();
  });

  it("скачивает со своим допуском и закрывает диалог", async () => {
    const { api, dialog, scope } = setup();
    dialog.choice.value = { preset: "custom", custom: { tolerance: 0.05, angleDeg: 12 } };
    api.meshTarget.value = { format: "stl", bodyIds: ["b2"] };
    dialog.confirm();
    expect(api.download).toHaveBeenCalledWith({ format: "stl", bodyIds: ["b2"] }, { tolerance: 0.05, angleDeg: 12 });
    expect(api.meshTarget.value).toBeNull();
    scope.stop();
  });

  it("показывает ошибку оценки", async () => {
    const { api, dialog, scope } = setup(() => Promise.reject(new Error("Нечего экспортировать: нет видимых тел.")));
    api.meshTarget.value = { format: "stl", bodyIds: null };
    await settle();
    expect(dialog.estimateText.value).toBe("Нечего экспортировать: нет видимых тел.");
    scope.stop();
  });
});
