import { computed, ref, type Ref } from "vue";
import { markerIndexAt, steppedMarker } from "@/lib/timelineMarker";

export function useTimelineMarkerDrag(deps: {
  marker: Ref<number>;
  count: Ref<number>;
  nodes: () => HTMLElement[];
  onDrop: (index: number) => void;
}) {
  const preview = ref<number | null>(null);
  const shown = computed(() => preview.value ?? deps.marker.value);

  function indexAt(x: number): number {
    const centers = deps.nodes().map((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left + rect.width / 2;
    });
    return markerIndexAt(centers, x);
  }

  function start(event: PointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    preview.value = deps.marker.value;
  }

  function move(event: PointerEvent) {
    if (preview.value !== null) preview.value = indexAt(event.clientX);
  }

  function finish() {
    const target = preview.value;
    preview.value = null;
    if (target !== null && target !== deps.marker.value) deps.onDrop(target);
  }

  function step(delta: number) {
    const target = steppedMarker(deps.marker.value, delta, deps.count.value);
    if (target !== deps.marker.value) deps.onDrop(target);
  }

  return { shown, dragging: computed(() => preview.value !== null), start, move, finish, step };
}
