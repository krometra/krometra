import { computed, ref, type Ref } from "vue";
import { useSelection } from "@/composables/shared/useSelection";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { apiErrorMessage, toast } from "@/composables/useToast";
import { deleteBody, deleteEntry } from "@/lib/bodyHistory";
import type { DocumentEdit } from "@/core/commands/DocumentEditCommand";
import type { CtxItem, TreeItemKind } from "./types";
import type { BodyPresentationApi } from "./useBodyPresentation";
import type { useDocumentModel } from "./useDocumentModel";
import type { ExportApi } from "./useExport";
import type { ExtrudeRevolveApi } from "./useExtrudeRevolve";
import type { ModelHistoryApi } from "./useModelHistory";
import type { SketchLifecycleApi } from "./useSketchLifecycle";

interface Renamer {
  startRename(id: string, name: string): void;
}

export function useTreeContextMenu(deps: {
  tree: Ref<Renamer | null>;
  model: ReturnType<typeof useDocumentModel>;
  sketchFlow: SketchLifecycleApi;
  extrude: ExtrudeRevolveApi;
  history: ModelHistoryApi;
  bodyPresentation: BodyPresentationApi;
  exportApi: ExportApi;
}) {
  const { tree, model, sketchFlow, extrude, history, bodyPresentation, exportApi } = deps;
  const selection = useSelection();
  const names = useDisplayNames();
  const menu = ref<{ x: number; y: number; kind: TreeItemKind; id: string } | null>(null);

  function open(event: MouseEvent, kind: TreeItemKind, id: string) {
    menu.value = { x: event.clientX, y: event.clientY, kind, id };
  }

  function close() {
    menu.value = null;
  }

  async function remove(label: string, edit: DocumentEdit) {
    try {
      await history.edit(label, edit);
      toast(`${label}: готово. Отменить — Ctrl+Z`, "success");
    } catch (error) {
      toast(apiErrorMessage(error, "Удалить не удалось"), "warning");
    }
  }

  async function toggleVisibility(bodyId: string) {
    const visible = model.bodies.value.find((body) => body.id === bodyId)?.visible === false;
    await bodyPresentation.setVisible(bodyId, visible).catch((error) => toast(apiErrorMessage(error, "Не удалось изменить видимость"), "warning"));
  }

  async function toggleSketchVisibility(sketchId: string) {
    const visible = model.sketches.value.find((sketch) => sketch.id === sketchId)?.visible === false;
    await bodyPresentation.setSketchVisible(sketchId, visible).catch((error) => toast(apiErrorMessage(error, "Не удалось изменить видимость"), "warning"));
  }

  function sketchItems(id: string): CtxItem[] {
    const sketch = model.sketches.value.find((candidate) => candidate.id === id);
    const items: CtxItem[] = [
      { label: sketch?.visible !== false ? "Скрыть" : "Показать", action: () => toggleSketchVisibility(id) },
      { label: "Редактировать эскиз", action: () => sketchFlow.editSketch(id) },
      { label: "Выдавить", action: () => extrude.startExtrudeFromSketch(id, "extrude") },
      { label: "Вращать", action: () => extrude.startExtrudeFromSketch(id, "revolve") },
      { label: "Переименовать", action: () => tree.value?.startRename(id, names.sketchLabel(id)) },
    ];
    if (!model.sketchHasFeature(id)) items.push({ label: "Удалить", danger: true, action: () => sketchFlow.deleteSketch(id) });
    return items;
  }

  function bodyItems(id: string): CtxItem[] {
    const body = model.bodies.value.find((candidate) => candidate.id === id);
    const label = `Удалить ${names.bodyLabel(id)}`;
    return [
      { label: body?.visible !== false ? "Скрыть" : "Показать", action: () => toggleVisibility(id) },
      { label: "Переименовать", action: () => tree.value?.startRename(id, names.bodyLabel(id)) },
      { label: "Экспорт STEP", action: () => exportApi.download({ format: "step", bodyIds: [id] }) },
      { label: "Экспорт STL…", action: () => exportApi.openMeshExport("stl", [id]) },
      { label: "Экспорт 3MF…", action: () => exportApi.openMeshExport("3mf", [id]) },
      { label: "Удалить с историей", danger: true, action: () => remove(label, (document) => deleteBody(document, id, names.entryLabel)) },
    ];
  }

  function featureItems(id: string): CtxItem[] {
    const entry = model.timelineEntries.value.find((candidate) => candidate.id === id);
    const items: CtxItem[] = [{ label: "Показать свойства", action: () => selection.selectFeature(id) }];
    if (!entry) return items;
    if (entry.kind === "sketch" && entry.sketch_id) {
      const sketchId = entry.sketch_id;
      items.push({ label: "Редактировать эскиз", action: () => sketchFlow.editSketch(sketchId) });
    }
    const label = `Удалить ${names.entryLabel(entry)}`;
    items.push(
      { label: "Переименовать", action: () => tree.value?.startRename(id, names.entryLabel(entry)) },
      { label: "Удалить", danger: true, action: () => remove(label, (document) => deleteEntry(document, id, names.entryLabel)) },
    );
    return items;
  }

  const items = computed<CtxItem[]>(() => {
    const current = menu.value;
    if (!current) return [];
    if (current.kind === "sketch") return sketchItems(current.id);
    if (current.kind === "body") return bodyItems(current.id);
    return featureItems(current.id);
  });

  return { menu, items, open, close, toggleVisibility, toggleSketchVisibility };
}
