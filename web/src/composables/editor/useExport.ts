import { ref } from "vue";
import type { Ref } from "vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { QUALITY_PRESETS, meshTolerance, type CustomQuality } from "@/lib/meshQuality";
import {
  EXPORT_MIME,
  bodiesFilename,
  exportBodyIdsOf,
  exportFilename,
  requestedExportBodyIds,
  type ExportFormat,
  type MeshFormat,
} from "./exportSource";
import type { ComponentEntry } from "./useDocumentModel";

export interface ExportedFile {
  buffer: ArrayBuffer;
  mime: string;
  filename: string;
}

export interface ExportTarget<F extends ExportFormat = ExportFormat> {
  format: F;
  bodyIds: string[] | null;
}

function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useExport(deps: { projectName: Ref<string>; bodies: Ref<ComponentEntry[]> }) {
  const names = useDisplayNames();
  const loading = ref(false);
  const error = ref<string | null>(null);
  const meshTarget = ref<ExportTarget<MeshFormat> | null>(null);

  function targetBodyIds(bodyIds: string[] | null): string[] {
    return bodyIds ? requestedExportBodyIds(deps.bodies.value, bodyIds) : exportBodyIdsOf(deps.bodies.value);
  }

  async function exportBuffer(format: ExportFormat, ids: string[], quality: CustomQuality): Promise<ArrayBuffer> {
    const { exportBrowserBodies } = await import("./useBrowserGeometry");
    if (format === "step") return exportBrowserBodies(format, ids);
    return exportBrowserBodies(format, ids, { mesh: meshTolerance(quality), names: ids.map(names.bodyLabel) });
  }

  async function buildFile(format: ExportFormat, bodyIds?: string[], quality: CustomQuality = QUALITY_PRESETS.normal): Promise<ExportedFile> {
    const ids = targetBodyIds(bodyIds ?? null);
    return {
      buffer: await exportBuffer(format, ids, quality),
      mime: EXPORT_MIME[format],
      filename: exportFilename(deps.projectName.value, format, bodyIds ? ids.map(names.bodyLabel) : null),
    };
  }

  async function download(target: ExportTarget, quality: CustomQuality = QUALITY_PRESETS.normal): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const ids = targetBodyIds(target.bodyIds);
      const buffer = await exportBuffer(target.format, ids, quality);
      const filename = target.bodyIds
        ? bodiesFilename(ids.map(names.bodyLabel), target.format)
        : exportFilename(deps.projectName.value, target.format, null);
      saveFile(new Blob([buffer], { type: EXPORT_MIME[target.format] }), filename);
    } catch (err) {
      error.value = err instanceof Error && err.message ? err.message : `Не удалось скачать ${target.format.toUpperCase()}`;
    } finally {
      loading.value = false;
    }
  }

  async function estimateTriangles(bodyIds: string[] | null, quality: CustomQuality): Promise<number> {
    const ids = targetBodyIds(bodyIds);
    const { estimateBrowserTriangles } = await import("./useBrowserGeometry");
    return estimateBrowserTriangles(ids, meshTolerance(quality));
  }

  function targetLabel(bodyIds: string[] | null): string {
    return bodyIds ? bodyIds.map(names.bodyLabel).join(", ") : "Все видимые тела";
  }

  return {
    loading,
    error,
    meshTarget,
    buildFile,
    download,
    estimateTriangles,
    targetLabel,
    downloadStep: () => download({ format: "step", bodyIds: null }),
    openMeshExport: (format: MeshFormat, bodyIds: string[] | null = null) => {
      meshTarget.value = { format, bodyIds };
    },
    closeMeshExport: () => {
      meshTarget.value = null;
    },
  };
}

export type ExportApi = ReturnType<typeof useExport>;
