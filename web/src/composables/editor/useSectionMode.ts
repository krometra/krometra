import { computed, ref, shallowRef } from "vue";
import { useSelection } from "@/composables/shared/useSelection";
import { toast } from "@/composables/useToast";
import {
  baseAnchor,
  clampOffset,
  clipPlane,
  flipFacingCamera,
  middleOffset,
  offsetRange,
  offsetStep,
  sectionViewTarget,
  type OffsetRange,
  type SectionAnchor,
  type SectionBase,
} from "@/lib/sectionPlane";
import type { LookAtTarget } from "@/lib/lookAtView";
import type { Vec3 } from "@/lib/threadGeometry";
import type { ViewportRef } from "./types";

export type SectionSource = SectionBase | "face";

const OFFSET_DIGITS = 1000;

export function useSectionMode(viewportRef: ViewportRef) {
  const selection = useSelection();
  const active = ref(false);
  const source = ref<SectionSource>("XY");
  const anchor = shallowRef<SectionAnchor>(baseAnchor("XY"));
  const range = ref<OffsetRange>({ min: 0, max: 0 });
  const offset = ref(0);
  const flipped = ref(false);
  const step = computed(() => offsetStep(range.value));
  const selectedFace = computed(() => (selection.selection.value?.type === "face" ? selection.selection.value : null));

  function cameraPosition(): Vec3 {
    const position = viewportRef.value?.getCameraState().position ?? { x: 0, y: 0, z: 1 };
    return [position.x, position.y, position.z];
  }

  function apply() {
    viewportRef.value?.setSection(clipPlane(anchor.value, offset.value, flipped.value));
  }

  function place(nextSource: SectionSource, nextAnchor: SectionAnchor) {
    source.value = nextSource;
    anchor.value = nextAnchor;
    range.value = offsetRange(nextAnchor, viewportRef.value?.modelBounds() ?? null);
    offset.value = Math.round(middleOffset(range.value) * OFFSET_DIGITS) / OFFSET_DIGITS;
    flipped.value = flipFacingCamera(nextAnchor, offset.value, cameraPosition());
    active.value = true;
    apply();
  }

  function setBase(plane: SectionBase) {
    place(plane, baseAnchor(plane));
  }

  function setFace(bodyId: string, faceId: string | number) {
    const frame = viewportRef.value?.faceFrame(bodyId, faceId);
    if (!frame) {
      toast("Сечение строится только по плоской грани", "info");
      return;
    }
    place("face", { origin: frame.center, normal: frame.normal });
  }

  function setSelectedFace() {
    const face = selectedFace.value;
    if (face) setFace(face.bodyId, face.faceId);
  }

  function setOffset(value: number) {
    offset.value = clampOffset(value, range.value);
    apply();
  }

  function flip() {
    flipped.value = !flipped.value;
    apply();
  }

  function close(): boolean {
    if (!active.value) return false;
    active.value = false;
    viewportRef.value?.clearSection();
    return true;
  }

  function toggle() {
    if (!close()) setBase("XY");
  }

  function viewTarget(): LookAtTarget | null {
    if (!active.value) return null;
    return sectionViewTarget(anchor.value, offset.value, flipped.value, viewportRef.value?.modelBounds() ?? null);
  }

  return {
    active,
    source,
    range,
    offset,
    flipped,
    step,
    selectedFace,
    setBase,
    setFace,
    setSelectedFace,
    setOffset,
    flip,
    close,
    toggle,
    viewTarget,
  };
}

export type SectionModeApi = ReturnType<typeof useSectionMode>;
