import { useI18n } from "@/composables/shared/useI18n";
import { ref } from "vue";
import { useSelection } from "@/composables/shared/useSelection";
import { toast } from "@/composables/useToast";
import { basePlaneTarget } from "@/lib/lookAtView";
import type { SectionBase } from "@/lib/sectionPlane";
import { useSectionMode } from "./useSectionMode";
import type { CtxItem, ViewportRef } from "./types";

interface ViewMenu {
  x: number;
  y: number;
  items: CtxItem[];
}

export function useViewInspect(viewportRef: ViewportRef) {
  const { t: tr } = useI18n();
  const selection = useSelection();
  const section = useSectionMode(viewportRef);
  const menu = ref<ViewMenu | null>(null);

  function lookAtFace(bodyId: string, faceId: string | number) {
    if (!viewportRef.value?.lookAtFace(bodyId, faceId)) toast(tr("editorOps.normalFlat"), "info");
  }

  function lookAtPlane(plane: SectionBase) {
    viewportRef.value?.lookAt(basePlaneTarget(plane, viewportRef.value.modelBounds()));
  }

  function lookAtSection() {
    const target = section.viewTarget();
    if (target) viewportRef.value?.lookAt(target);
  }

  function lookAtSelection() {
    const current = selection.selection.value;
    if (current?.type === "face") lookAtFace(current.bodyId, current.faceId);
    else if (section.active.value) lookAtSection();
    else toast(tr("editorOps.chooseFlat"), "info");
  }

  function openFaceMenu(payload: { bodyId: string; faceId: string | number; x: number; y: number }) {
    menu.value = {
      x: payload.x,
      y: payload.y,
      items: [
        { label: tr("editorOps.normalView"), action: () => lookAtFace(payload.bodyId, payload.faceId) },
        { label: tr("editorOps.sectionFace"), action: () => section.setFace(payload.bodyId, payload.faceId) },
      ],
    };
  }

  function openPlaneMenu(event: MouseEvent, plane: SectionBase) {
    menu.value = {
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: tr("editorOps.normalView"), action: () => lookAtPlane(plane) },
        { label: tr("editorOps.sectionPlane"), action: () => section.setBase(plane) },
      ],
    };
  }

  function closeMenu() {
    menu.value = null;
  }

  function dismiss(): boolean {
    if (!menu.value) return section.close();
    closeMenu();
    return true;
  }

  return { section, menu, lookAtSelection, lookAtSection, openFaceMenu, openPlaneMenu, closeMenu, dismiss };
}

export type ViewInspectApi = ReturnType<typeof useViewInspect>;
