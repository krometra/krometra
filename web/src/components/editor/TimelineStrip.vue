<script setup lang="ts">
import { computed, ref } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import { useTimelineMarkerDrag } from "@/composables/editor/useTimelineMarkerDrag";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { mirrorDetail } from "@/lib/mirrorPlane";
import { draftDetail } from "@/lib/browserDraft";
import { holeDetail } from "@/lib/holeFeature";
import { LOFT_ICON, loftSummary } from "@/lib/loftFeature";
import { patternSpecFromParams, patternSummary } from "@/lib/bodyPatternParams";
import { pressPullDetail } from "@/lib/browserPressPull";
import { booleanToolsOf, isFailed, isRolledBack, isSuppressed } from "@/lib/timelineFlags";
import { entryStateHint, timelineSlots } from "@/lib/timelineMarker";
import type { TimelineEntry } from "@/types/api";

const props = defineProps<{
  entries: TimelineEntry[];
  selectedId: string | null;
  marker: number;
  lockReason?: string | null;
}>();

const emit = defineEmits<{
  select: [id: string];
  "context-menu": [e: MouseEvent, id: string];
  "add-sketch": [];
  rollback: [index: number];
}>();

const names = useDisplayNames();
const track = ref<HTMLElement | null>(null);
const drag = useTimelineMarkerDrag({
  marker: computed(() => props.marker),
  count: computed(() => props.entries.length),
  locked: computed(() => !!props.lockReason),
  nodes: () => [...(track.value?.querySelectorAll<HTMLElement>("[data-testid='timeline-node']") ?? [])],
  onDrop: (index) => emit("rollback", index),
});
const slots = computed(() => timelineSlots(props.entries, drag.shown.value));

function isEntryDirty(entry: TimelineEntry): boolean {
  return entry.status === "dirty";
}

function timelineIcon(kind: string): string {
  const icons: Record<string, string> = {
    sketch: "M3 3h18v18H3z M3 9h18 M9 3v18",
    extrude: "M12 3v18 M5 8l7-5 7 5 M5 8v8l7 5 7-5V8",
    boolean: "M3 3h8v8H3z M13 3h8v8h-8z M8 13h8v8H8z",
    revolve: "M12 3a9 9 0 1 1 0 18 M12 5v9l4 3",
    sweep: "M3 18c6 0 6-12 12-12 M15 6l3-2 0 4z",
    loft: LOFT_ICON,
    fillet: "M4 20V10a6 6 0 0 1 6-6h10",
    chamfer: "M4 20L20 4 M4 14v6h6",
    hole: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    import: "M12 3v12 M7 10l5 5 5-5 M4 19h16",
    transform: "M12 3v18 M3 12h18 M12 3l-3 3 M12 3l3 3 M21 12l-3-3 M21 12l-3 3",
    shell: "M5 8l7-5 7 5 M5 8v8l7 5 7-5V8 M9 10v4l3 2 3-2v-4",
    mirror: "M12 3v18 M7 7l-3 5 3 5 M17 7l3 5-3 5",
    draft: "M8 4h8l3 16H5z M12 4v16",
    pattern: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
    press_pull: "M4 14h16 M12 14V4 M8 8l4-4 4 4 M4 20h16",
  };
  return icons[kind] ?? icons.sketch;
}

function timelineDetail(entry: TimelineEntry): string {
  switch (entry.kind) {
    case "sketch":
      return `${entry.plane ?? '?'} · ${entry.entity_count ?? 0} об.`;
    case "extrude": {
      const p = entry.params ?? {};
      const dir = p.direction === 'symmetric' ? 'симм.' : 'одност.';
      return `${p.distance ?? '?'} мм · ${dir}`;
    }
    case "boolean":
      return `${entry.operation ?? '?'} · ${entry.target_body_id ? names.bodyLabel(entry.target_body_id) : '?'} + ${booleanToolsOf(entry).map(names.bodyLabel).join(', ') || '?'}`;
    case "revolve": {
      const p = entry.params ?? {};
      const dir = p.direction === 'symmetric' ? 'симм.' : 'одност.';
      return `${p.angle ?? '?'}° · ${p.axis ?? 'y'} · ${dir}`;
    }
    case "sweep": {
      const p = entry.params ?? {};
      const op = p.operation === 'cut' ? 'вырез' : p.operation === 'join' ? 'приклеить' : 'тело';
      return `${op} · ${typeof p.path_sketch_id === 'string' ? names.sketchLabel(p.path_sketch_id) : '?'}`;
    }
    case "loft":
      return loftSummary(entry.params ?? {});
    case "fillet": {
      const p = entry.params ?? {};
      const edges = Array.isArray(p.edge_ids) ? p.edge_ids.length : 0;
      return `R${p.radius ?? '?'}мм · ${edges} реб.`;
    }
    case "chamfer": {
      const p = entry.params ?? {};
      const edges = Array.isArray(p.edge_ids) ? p.edge_ids.length : 0;
      return `${p.distance1 ?? '?'}×${p.distance2 ?? '?'}мм · ${edges} реб.`;
    }
    case "thread": {
      const p = entry.params ?? {};
      const kind = p.kind === 'internal' ? 'внутр.' : 'внеш.';
      return `${kind} · шаг ${p.pitch ?? '?'}мм`;
    }
    case "hole":
      return holeDetail(entry.params ?? {});
    case "import":
      return typeof entry.params?.file_name === 'string' ? entry.params.file_name : 'STEP';
    case "transform":
      return entry.params?.copy === true ? 'копия' : 'сдвиг';
    case "shell":
      return `${entry.params?.thickness ?? '?'}мм · ${entry.params?.direction === 'outward' ? 'наружу' : 'внутрь'}`;
    case "mirror":
      return mirrorDetail(entry.params ?? {});
    case "draft":
      return draftDetail(entry.params ?? {});
    case "pattern":
      return patternSummary(patternSpecFromParams(entry.params ?? {}));
    case "press_pull":
      return pressPullDetail(entry.params ?? {});
    default:
      return '';
  }
}
</script>

<template>
  <div :class="$style.timeline">
    <div ref="track" :class="$style.track">
      <template v-for="slot in slots" :key="slot.kind === 'entry' ? slot.entry.id : 'marker'">
        <div
          v-if="slot.kind === 'marker'"
          data-testid="timeline-marker"
          role="slider"
          tabindex="0"
          aria-label="Маркер отката истории"
          :aria-valuemin="0"
          :aria-valuemax="entries.length"
          :aria-valuenow="drag.shown.value"
          :aria-disabled="lockReason ? true : undefined"
          :title="lockReason ?? 'Маркер отката: перетащите, чтобы показать модель на этом шаге (стрелки влево/вправо)'"
          :class="[$style.marker, drag.dragging.value && $style.markerDragging, lockReason && $style.markerLocked]"
          @pointerdown.prevent="drag.start"
          @pointermove="drag.move"
          @pointerup="drag.finish"
          @pointercancel="drag.finish"
          @keydown.left.prevent="drag.step(-1)"
          @keydown.right.prevent="drag.step(1)"
        />
        <div
          v-else
          data-testid="timeline-node"
          :data-state="isFailed(slot.entry) ? 'error' : isSuppressed(slot.entry) ? 'suppressed' : isRolledBack(slot.entry) ? 'rolled-back' : 'active'"
          :title="entryStateHint(slot.entry) ?? undefined"
          :class="[$style.node, (isSuppressed(slot.entry) || isRolledBack(slot.entry)) && $style.nodeInactive]"
          @click="emit('select', slot.entry.id)"
          @contextmenu.prevent="emit('context-menu', $event, slot.entry.id)"
        >
          <div
            :class="[
              $style.nodeIcon,
              selectedId === slot.entry.id && $style.nodeIconActive,
              isEntryDirty(slot.entry) && $style.nodeIconDirty,
              isFailed(slot.entry) && $style.nodeIconError,
            ]"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path :d="timelineIcon(slot.entry.kind)" />
            </svg>
          </div>
          <div :class="[$style.nodeLabel, isSuppressed(slot.entry) && $style.nodeLabelSuppressed]">{{ names.entryLabel(slot.entry) }}</div>
          <div :class="$style.nodeDetail">{{ timelineDetail(slot.entry) }}</div>
        </div>
      </template>
      <CsButton
        variant="ghost"
        size="sm"
        :class="$style.addNode"
        :disabled="!!lockReason"
        :title="lockReason ?? 'Новая операция — начните с эскиза (S)'"
        @click="emit('add-sketch')"
        >＋</CsButton
      >
    </div>
  </div>
</template>

<style module>
.timeline {
  height: 92px;
  flex-shrink: 0;
  border-top: 1px solid var(--cs-border-subtle);
  background: var(--cs-surface-alt);
  display: flex;
  align-items: stretch;
}

.track {
  flex: 1;
  overflow-x: auto;
  display: flex;
  align-items: center;
  padding: 0 8px;
  position: relative;
}

.node {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 13px;
  flex-shrink: 0;
  cursor: pointer;
  position: relative;
}

.nodeIcon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cs-surface-raised);
  border: 1.5px solid var(--cs-border-strong);
  color: var(--cs-text-secondary);
  transition: all var(--cs-transition-fast);
}

.nodeIconActive {
  background: var(--cs-primary-soft);
  border-color: var(--cs-primary);
  color: var(--cs-primary);
  box-shadow: 0 0 0 4px oklch(0.52 0.15 244 / 0.12);
}

.nodeIconDirty {
  border-color: oklch(0.78 0.13 75);
  box-shadow: 0 0 0 4px oklch(0.78 0.13 75 / 0.15);
}

.nodeInactive {
  opacity: 0.4;
}

.nodeIconError {
  border-color: var(--cs-red-strong);
  color: var(--cs-red-strong);
}

.nodeLabelSuppressed {
  text-decoration: line-through;
}

.marker {
  align-self: stretch;
  width: 12px;
  margin: 10px -2px;
  flex-shrink: 0;
  cursor: ew-resize;
  position: relative;
  touch-action: none;
  border-radius: 4px;
}

.marker::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 0;
  bottom: 0;
  width: 2px;
  border-radius: 1px;
  background: var(--cs-primary);
}

.marker::after {
  content: "";
  position: absolute;
  left: 1px;
  top: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--cs-primary);
}

.marker:focus-visible {
  outline: 2px solid var(--cs-primary);
  outline-offset: 2px;
}

.markerLocked {
  cursor: not-allowed;
  opacity: 0.5;
}

.markerDragging::before,
.markerDragging::after {
  background: var(--cs-primary-active);
}

.nodeLabel {
  font-size: 10px;
  color: var(--cs-text-secondary);
  margin-top: 5px;
  white-space: nowrap;
  font-weight: var(--cs-font-weight-medium);
}

.nodeDetail {
  font-family: var(--cs-font-mono);
  font-size: 9px;
  color: var(--cs-text-muted);
  white-space: nowrap;
}

/* Пунктирная квадратная кнопка «плюс»: перебиваем геометрию CsButton size="sm". */
.addNode.addNode {
  width: 38px;
  height: 38px;
  padding: 0;
  border-radius: 9px;
  border: 1.5px dashed var(--cs-border-strong);
  color: var(--cs-text-secondary);
  font-size: 18px;
  background: var(--cs-surface-alt);
  flex-shrink: 0;
  margin: 0 16px;
}

.addNode.addNode:hover {
  background: var(--cs-surface-alt);
  border-color: var(--cs-primary);
  color: var(--cs-primary);
}
</style>
