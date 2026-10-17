import { computed, ref, type Ref } from "vue";
import { useSelection } from "@/composables/shared/useSelection";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { apiErrorMessage, toast } from "@/composables/useToast";
import { deleteBody } from "@/lib/bodyHistory";
import { isSuppressed } from "@/lib/timelineFlags";
import type { DocumentEdit } from "@/core/commands/DocumentEditCommand";
import type { CtxItem, TreeItemKind } from "./types";
import type { BodyPresentationApi } from "./useBodyPresentation";
import type { useDocumentModel } from "./useDocumentModel";
import type { ExportApi } from "./useExport";
import type { ExtrudeRevolveApi } from "./useExtrudeRevolve";
import type { ModelHistoryApi } from "./useModelHistory";
import type { SketchLifecycleApi } from "./useSketchLifecycle";
import { useSketchVisibility } from "./useSketchVisibility";
import type { TimelineEditsApi } from "./useTimelineEdits";

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
  timelineEdits: TimelineEditsApi;
}) {
  const { tree, model, sketchFlow, extrude, history, bodyPresentation, exportApi, timelineEdits } = deps;
  const selection = useSelection();
  const names = useDisplayNames();
  const sketchVisibility = useSketchVisibility();
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
    const sketch = model.sketches.value.find((candidate) => candidate.id === sketchId);
    if (!sketch) return;
    await bodyPresentation.setSketchVisible(sketchId, !sketchVisibility.isVisible(sketch)).catch((error) => toast(apiErrorMessage(error, "Не удалось изменить видимость"), "warning"));
  }

  function sketchItems(id: string): CtxItem[] {
    const sketch = model.sketches.value.find((candidate) => candidate.id === id);
    const items: CtxItem[] = [
      { label: sketch && sketchVisibility.isVisible(sketch) ? "Скрыть" : "Показать", action: () => toggleSketchVisibility(id) },
      { label: "Редактировать эскиз", action: () => sketchFlow.editSketch(id) },
      { label: "Выдавить", action: () => extrude.startExtrudeFromSketch(id, "extrude") },
      { label: "Вращать", action: () => extrude.startExtrudeFromSketch(id, "revolve") },
      { label: "Переименовать", action: () => tree.value?.startRename(id, names.sketchLabel(id)) },
    ];
    const removeSketch = () => (model.sketchHasFeature(id) ? timelineEdits.requestSketchDelete(id) : sketchFlow.deleteSketch(id));
    items.push({ label: "Удалить", danger: true, action: removeSketch });
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

  function markerItems(id: string): CtxItem[] {
    const items: CtxItem[] = [{ label: "Откатить сюда", action: () => timelineEdits.rollAfter(id) }];
    if (!timelineEdits.rolledBack.value) return items;
    return [
      ...items,
      { label: "Вернуть маркер в конец", action: () => timelineEdits.rollTo(model.timelineEntries.value.length) },
      { label: "Удалить всё после маркера", danger: true, action: () => timelineEdits.deleteAfterMarker() },
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
    items.push({ label: "Переименовать", action: () => tree.value?.startRename(id, names.entryLabel(entry)) });
    if (entry.kind !== "sketch") {
      items.push({ label: isSuppressed(entry) ? "Снять подавление" : "Подавить", action: () => timelineEdits.toggleSuppressed(id) });
    }
    items.push(...markerItems(id), { label: "Удалить", danger: true, action: () => timelineEdits.requestDelete(id) });
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
