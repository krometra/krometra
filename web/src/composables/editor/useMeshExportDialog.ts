import { computed, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { customQualityError, formatBytes, qualityValues, stlBytes, type QualityPreset } from "@/lib/meshQuality";
import type { ExportApi } from "./useExport";
import { useExportQuality } from "./useExportQuality";

const ESTIMATE_DELAY_MS = 250;

export function estimateSummary(triangles: number, format: "stl" | "3mf"): string {
  const count = `Треугольников: ${triangles.toLocaleString("ru-RU")}`;
  return format === "stl" ? `${count} · файл ≈ ${formatBytes(stlBytes(triangles))}` : count;
}

export function useMeshExportDialog(exportApi: ExportApi) {
  const { choice } = useExportQuality();
  const target = exportApi.meshTarget;
  const triangles = ref<number | null>(null);
  const estimateError = ref<string | null>(null);
  let estimateToken = 0;

  const qualityError = computed(() => (choice.value.preset === "custom" ? customQualityError(choice.value.custom) : null));
  const values = computed(() => qualityValues(choice.value));

  const preset = computed<QualityPreset>({
    get: () => choice.value.preset,
    set: (value) => {
      choice.value = { ...choice.value, preset: value };
    },
  });

  async function estimate() {
    const token = ++estimateToken;
    const current = target.value;
    if (!current || qualityError.value) return;
    try {
      const count = await exportApi.estimateTriangles(current.bodyIds, values.value);
      if (token === estimateToken) triangles.value = count;
    } catch (error) {
      if (token === estimateToken) estimateError.value = error instanceof Error ? error.message : "Не удалось оценить сетку.";
    }
  }

  const scheduleEstimate = useDebounceFn(estimate, ESTIMATE_DELAY_MS);

  function resetEstimate() {
    estimateToken++;
    triangles.value = null;
    estimateError.value = null;
  }

  watch(
    [target, values],
    () => {
      resetEstimate();
      if (target.value) void scheduleEstimate();
    },
    { deep: true },
  );

  const estimateText = computed(() => {
    if (qualityError.value) return qualityError.value;
    if (estimateError.value) return estimateError.value;
    if (triangles.value === null || !target.value) return "Считаю сетку…";
    return estimateSummary(triangles.value, target.value.format);
  });

  function confirm() {
    const current = target.value;
    if (!current || qualityError.value) return;
    exportApi.closeMeshExport();
    void exportApi.download(current, { ...values.value });
  }

  return { target, choice, preset, values, qualityError, estimateText, confirm, close: exportApi.closeMeshExport };
}
