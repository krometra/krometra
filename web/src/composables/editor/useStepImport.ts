import { ref } from "vue";
import { useDocument } from "@/composables/shared/useDocument";
import { useSketch } from "@/composables/shared/useSketch";
import { useUndoRedo } from "@/composables/shared/useUndoRedo";
import { toast } from "@/composables/useToast";
import { importFileError, importSummary } from "@/lib/browserImport";
import type { BodyMeshesApi } from "./useBodyMeshes";
import type { ViewportRef } from "./types";

const STEP_FILE_TYPES = ".step,.stp";

function chooseStepFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = STEP_FILE_TYPES;
    input.style.display = "none";
    input.dataset.testid = "import-step-input";
    const finish = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

export function useStepImport(deps: { projectId: string; viewportRef: ViewportRef; meshes: BodyMeshesApi }) {
  const { projectId, viewportRef, meshes } = deps;
  const documentStore = useDocument();
  const undoRedo = useUndoRedo();
  const sketch = useSketch();
  const loading = ref(false);

  async function saveImport(file: File): Promise<string[]> {
    const { BrowserImportCommand } = await import("@/core/commands/BrowserImportCommand");
    const command = new BrowserImportCommand(
      projectId,
      file.name,
      await file.arrayBuffer(),
      () => documentStore.document.value,
    );
    await undoRedo.execute(command);
    const bodies = command.getResult();
    if (bodies.length === 0) throw new Error("Импорт не выполнен: редактор был занят другой операцией. Повторите импорт.");
    bodies.forEach((body) => meshes.trackMesh(body.bodyId, body.mesh));
    return bodies.map((body) => body.bodyId);
  }

  async function importStep(file: File): Promise<string[]> {
    const rejection = importFileError(file.name, file.size);
    if (rejection) throw new Error(rejection);
    if (sketch.sketchMode.value) throw new Error("Завершите эскиз, прежде чем импортировать STEP.");
    if (undoRedo.isExecuting.value) throw new Error("Дождитесь завершения текущей операции и повторите импорт.");
    loading.value = true;
    try {
      const bodyIds = await saveImport(file);
      await documentStore.load(projectId);
      viewportRef.value?.fitAllBodies();
      return bodyIds;
    } finally {
      loading.value = false;
    }
  }

  async function importFile(file: File) {
    try {
      toast(importSummary(file.name, (await importStep(file)).length), "success");
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : "Не удалось импортировать STEP-файл.", "error");
    }
  }

  async function pickFile() {
    if (loading.value) return;
    const file = await chooseStepFile();
    if (file) await importFile(file);
  }

  return { loading, pickFile, importFile, importStep };
}

export type StepImportApi = ReturnType<typeof useStepImport>;
