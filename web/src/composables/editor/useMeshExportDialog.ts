import { computed, ref, watch } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import { LOCALE_HTML_LANG } from "@/lib/i18n/locale";
import { useDebounceFn } from "@vueuse/core";
import { ANGLE_RANGE_DEG, TOLERANCE_RANGE, customQualityError, formatBytes, qualityValues, stlBytes, type QualityPreset } from "@/lib/meshQuality";
import type { ExportApi } from "./useExport";
import { useExportQuality } from "./useExportQuality";

const ESTIMATE_DELAY_MS = 250;

export function estimateSummary(triangles: number, format: "stl" | "3mf"): string {
  const count = `Треугольников: ${triangles.toLocaleString("ru-RU")}`;
  return format === "stl" ? `${count} · файл ≈ ${formatBytes(stlBytes(triangles))}` : count;
}

export function useMeshExportDialog(exportApi: ExportApi) {
  const { t, locale } = useI18n();
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
      if (token === estimateToken) estimateError.value = error instanceof Error ? error.message : t("editorOps.estimateFailed");
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
    if (qualityError.value) return qualityError.value.startsWith("Линейный")
      ? t("editorOps.linearRange", TOLERANCE_RANGE)
      : t("editorOps.angleRangeExport", ANGLE_RANGE_DEG);
    if (estimateError.value) return estimateError.value;
    if (triangles.value === null || !target.value) return t("editorOps.estimating");
    const count = t("editorOps.triangles", { count: triangles.value.toLocaleString(LOCALE_HTML_LANG[locale.value]) });
    if (target.value.format !== "stl") return count;
    const size = formatBytes(stlBytes(triangles.value))
      .replace("КБ", t("editorOps.kilobyte"))
      .replace("МБ", t("editorOps.megabyte"))
      .replace(/ Б$/, ` ${t("editorOps.byte")}`);
    return t("editorOps.fileSize", { count, size });
  });

  function confirm() {
    const current = target.value;
    if (!current || qualityError.value) return;
    exportApi.closeMeshExport();
    void exportApi.download(current, { ...values.value });
  }

  return { target, choice, preset, values, qualityError, estimateText, confirm, close: exportApi.closeMeshExport };
}
