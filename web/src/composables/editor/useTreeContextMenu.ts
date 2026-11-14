import { useI18n } from "@/composables/shared/useI18n";
import { computed, ref, type Ref } from "vue";
import { useSelection } from "@/composables/shared/useSelection";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { apiErrorMessage, toast } from "@/composables/useToast";
import { deleteBody } from "@/lib/bodyHistory";
import { isSuppressed } from "@/lib/timelineFlags";
import { isOpenSketch, isOpenSketchEntry, lockItems } from "@/lib/timelineGuards";
import type { DocumentEdit } from "@/core/commands/DocumentEditCommand";
import type { CtxItem, TreeItemKind } from "./types";
import type { BodyPresentationApi } from "./useBodyPresentation";
import type { useDocumentModel } from "./useDocumentModel";
import type { ExportApi } from "./useExport";
import type { ExtrudeRevolveApi } from "./useExtrudeRevolve";
import { useHistoryLock } from "./useHistoryLock";
import type { ModelHistoryApi } from "./useModelHistory";
import type { SketchLifecycleApi } from "./useSketchLifecycle";
import { useSketchVisibility } from "./useSketchVisibility";
import type { TimelineEditsApi } from "./useTimelineEdits";
import type { WorkPlanesApi } from "./useWorkPlanes";

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
  workPlanes: WorkPlanesApi;
}) {
  const { t: tr } = useI18n();
  const { tree, model, sketchFlow, extrude, history, bodyPresentation, exportApi, timelineEdits } = deps;
  const selection = useSelection();
  const names = useDisplayNames();
  const sketchVisibility = useSketchVisibility();
  const lock = useHistoryLock();
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
      toast(tr("editorOps.done", { label }), "success");
    } catch (error) {
      toast(apiErrorMessage(error, tr("editorOps.deleteFailed")), "warning");
    }
  }

  async function toggleVisibility(bodyId: string) {
    const visible = model.bodies.value.find((body) => body.id === bodyId)?.visible === false;
    await bodyPresentation.setVisible(bodyId, visible).catch((error) => toast(apiErrorMessage(error, tr("editorOps.visibilityFailed")), "warning"));
  }

  async function toggleSketchVisibility(sketchId: string) {
    const sketch = model.sketches.value.find((candidate) => candidate.id === sketchId);
    if (!sketch) return;
    await bodyPresentation.setSketchVisible(sketchId, !sketchVisibility.isVisible(sketch)).catch((error) => toast(apiErrorMessage(error, tr("editorOps.visibilityFailed")), "warning"));
  }

  function sketchItems(id: string): CtxItem[] {
    const sketch = model.sketches.value.find((candidate) => candidate.id === id);
    const items: CtxItem[] = [
      { label: sketch && sketchVisibility.isVisible(sketch) ? tr("editorOps.hide") : tr("editorOps.show"), action: () => toggleSketchVisibility(id) },
      { label: tr("editorOps.editSketch"), editsModel: true, action: () => sketchFlow.editSketch(id) },
      { label: tr("editorOps.extrude"), editsModel: true, action: () => extrude.startExtrudeFromSketch(id, "extrude") },
      { label: tr("editorOps.revolve"), editsModel: true, action: () => extrude.startExtrudeFromSketch(id, "revolve") },
      { label: tr("editorOps.rename"), editsModel: true, action: () => tree.value?.startRename(id, names.sketchLabel(id)) },
    ];
    const removeSketch = () => (model.sketchHasFeature(id) ? timelineEdits.requestSketchDelete(id) : sketchFlow.deleteSketch(id));
    items.push(deleteItem(isOpenSketch(lock.state.value, id), removeSketch));
    return items;
  }

  function bodyItems(id: string): CtxItem[] {
    const body = model.bodies.value.find((candidate) => candidate.id === id);
    const label = tr("editorOps.deleteName", { name: names.bodyLabel(id) });
    return [
      { label: body?.visible !== false ? tr("editorOps.hide") : tr("editorOps.show"), action: () => toggleVisibility(id) },
      { label: tr("editorOps.rename"), editsModel: true, action: () => tree.value?.startRename(id, names.bodyLabel(id)) },
      { label: tr("editorOps.exportStep"), action: () => exportApi.download({ format: "step", bodyIds: [id] }) },
      { label: tr("editorOps.exportStl"), action: () => exportApi.openMeshExport("stl", [id]) },
      { label: tr("editorOps.export3mf"), action: () => exportApi.openMeshExport("3mf", [id]) },
      { label: tr("editorOps.deleteHistory"), danger: true, editsModel: true, action: () => remove(label, (document) => deleteBody(document, id, names.entryLabel)) },
    ];
  }

  function markerItems(id: string): CtxItem[] {
    const items: CtxItem[] = [{ label: tr("editorOps.rollbackHere"), editsModel: true, action: () => timelineEdits.rollAfter(id) }];
    if (!timelineEdits.rolledBack.value) return items;
    return [
      ...items,
      { label: tr("editorOps.moveEnd"), editsModel: true, action: () => timelineEdits.rollTo(model.timelineEntries.value.length) },
      { label: tr("editorOps.deleteAfter"), danger: true, editsModel: true, action: () => timelineEdits.deleteAfterMarker() },
    ];
  }

  function featureItems(id: string): CtxItem[] {
    const entry = model.timelineEntries.value.find((candidate) => candidate.id === id);
    const items: CtxItem[] = [{ label: tr("editorOps.properties"), action: () => selection.selectFeature(id) }];
    if (!entry) return items;
    if (entry.kind === "sketch" && entry.sketch_id) {
      const sketchId = entry.sketch_id;
      items.push({ label: tr("editorOps.editSketch"), editsModel: true, action: () => sketchFlow.editSketch(sketchId) });
    }
    items.push({ label: tr("editorOps.rename"), editsModel: true, action: () => tree.value?.startRename(id, names.entryLabel(entry)) });
    if (entry.kind !== "sketch") {
      items.push({ label: isSuppressed(entry) ? tr("editorOps.unsuppress") : tr("editorOps.suppress"), editsModel: true, action: () => timelineEdits.toggleSuppressed(id) });
    }
    items.push(...markerItems(id), deleteItem(isOpenSketchEntry(lock.state.value, entry), () => timelineEdits.requestDelete(id)));
    return items;
  }

  function deleteItem(openSketch: boolean, action: () => void): CtxItem {
    if (openSketch) return { label: tr("editorOps.delete"), danger: true, hint: tr("editorOps.openSketchDelete"), action };
    return { label: tr("editorOps.delete"), danger: true, editsModel: true, action };
  }

  function menuItems(kind: TreeItemKind, id: string): CtxItem[] {
    if (kind === "sketch") return sketchItems(id);
    if (kind === "body") return bodyItems(id);
    if (kind === "plane") return deps.workPlanes.menuItems(id, (planeId, name) => tree.value?.startRename(planeId, name));
    return featureItems(id);
  }

  const items = computed<CtxItem[]>(() => {
    const current = menu.value;
    return current ? lockItems(menuItems(current.kind, current.id), lock.reason.value) : [];
  });

  return { menu, items, open, close, toggleVisibility, toggleSketchVisibility };
}
