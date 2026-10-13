import { ref } from "vue";
import type { Ref } from "vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { EXPORT_MIME, exportBodyIdsOf, exportFilename, requestedExportBodyIds, type ExportFormat } from "./exportSource";
import type { ComponentEntry } from "./useDocumentModel";

export interface ExportedFile {
  buffer: ArrayBuffer;
  mime: string;
  filename: string;
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

export function useExport(deps: { projectName: Ref<string>; bodies: Ref<ComponentEntry[]> }): {
  loading: Ref<boolean>;
  error: Ref<string | null>;
  buildFile: (format: ExportFormat, bodyIds?: string[]) => Promise<ExportedFile>;
  downloadStl: () => Promise<void>;
  downloadStep: () => Promise<void>;
} {
  const names = useDisplayNames();
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function buildFile(format: ExportFormat, bodyIds?: string[]): Promise<ExportedFile> {
    const ids = bodyIds ? requestedExportBodyIds(deps.bodies.value, bodyIds) : exportBodyIdsOf(deps.bodies.value);
    const { exportBrowserBodies } = await import("./useBrowserGeometry");
    return {
      buffer: await exportBrowserBodies(format, ids),
      mime: EXPORT_MIME[format],
      filename: exportFilename(deps.projectName.value, format, bodyIds ? ids.map(names.bodyLabel) : null),
    };
  }

  async function doExport(format: ExportFormat): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const file = await buildFile(format);
      saveFile(new Blob([file.buffer], { type: file.mime }), file.filename);
    } catch (err) {
      error.value = err instanceof Error && err.message ? err.message : `Не удалось скачать ${format.toUpperCase()}`;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    buildFile,
    downloadStl: () => doExport("stl"),
    downloadStep: () => doExport("step"),
  };
}

export type ExportApi = ReturnType<typeof useExport>;
