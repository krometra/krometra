<script setup lang="ts">
import CsButton from "@/components/ui/CsButton.vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { mirrorDetail } from "@/lib/mirrorPlane";
import type { TimelineEntry } from "@/types/api";

defineProps<{
  entries: TimelineEntry[];
  selectedId: string | null;
}>();

const emit = defineEmits<{
  select: [id: string];
  "context-menu": [e: MouseEvent, id: string];
  "add-sketch": [];
}>();

const names = useDisplayNames();

function isEntryDirty(entry: TimelineEntry): boolean {
  return entry.status === "dirty";
}

function timelineIcon(kind: string): string {
  const icons: Record<string, string> = {
    sketch: "M3 3h18v18H3z M3 9h18 M9 3v18",
    extrude: "M12 3v18 M5 8l7-5 7 5 M5 8v8l7 5 7-5V8",
    boolean: "M3 3h8v8H3z M13 3h8v8h-8z M8 13h8v8H8z",
    revolve: "M12 3a9 9 0 1 1 0 18 M12 5v9l4 3",
    fillet: "M4 20V10a6 6 0 0 1 6-6h10",
    chamfer: "M4 20L20 4 M4 14v6h6",
    import: "M12 3v12 M7 10l5 5 5-5 M4 19h16",
    transform: "M12 3v18 M3 12h18 M12 3l-3 3 M12 3l3 3 M21 12l-3-3 M21 12l-3 3",
    mirror: "M12 3v18 M7 7l-3 5 3 5 M17 7l3 5-3 5",
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
      return `${entry.operation ?? '?'} · ${entry.target_body_id ? names.bodyLabel(entry.target_body_id) : '?'} + ${entry.tool_body_id ? names.bodyLabel(entry.tool_body_id) : '?'}`;
    case "revolve": {
      const p = entry.params ?? {};
      const dir = p.direction === 'symmetric' ? 'симм.' : 'одност.';
      return `${p.angle ?? '?'}° · ${p.axis ?? 'y'} · ${dir}`;
    }
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
    case "import":
      return typeof entry.params?.file_name === 'string' ? entry.params.file_name : 'STEP';
    case "transform":
      return entry.params?.copy === true ? 'копия' : 'сдвиг';
    case "mirror":
      return mirrorDetail(entry.params ?? {});
    default:
      return '';
  }
}
</script>

<template>
  <div :class="$style.timeline">
    <div :class="$style.track">
      <div
        v-for="entry in entries"
        :key="entry.id"
        data-testid="timeline-node"
        :class="$style.node"
        @click="emit('select', entry.id)"
        @contextmenu.prevent="emit('context-menu', $event, entry.id)"
      >
        <div :class="[$style.nodeIcon, selectedId === entry.id && $style.nodeIconActive, isEntryDirty(entry) && $style.nodeIconDirty]">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path :d="timelineIcon(entry.kind)" />
          </svg>
        </div>
        <div :class="$style.nodeLabel">{{ names.entryLabel(entry) }}</div>
        <div :class="$style.nodeDetail">{{ timelineDetail(entry) }}</div>
      </div>
      <CsButton
        variant="ghost"
        size="sm"
        :class="$style.addNode"
        title="Новая операция — начните с эскиза (S)"
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
