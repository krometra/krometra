<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useSelection } from "@/composables/shared/useSelection";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { useDocumentModel } from "@/composables/editor/useDocumentModel";
import type { TimelineEntry } from "@/types/api";
import type { TreeItemKind } from "@/composables/editor/types";

const props = defineProps<{ projectId: string }>();

const emit = defineEmits<{
  "context-menu": [e: MouseEvent, kind: TreeItemKind, id: string];
  "toggle-visibility": [bodyId: string];
}>();

const selection = useSelection();
const names = useDisplayNames();
const { timelineEntries, sketches, bodies } = useDocumentModel();

const selectedTimelineId = computed(() => selection.selectedFeatureId.value);
const sketchCount = computed(() => sketches.value.length);
const bodyCount = computed(() => bodies.value.length);
const timelineCount = computed(() => timelineEntries.value.length);

const open = reactive({ origin: false, sketches: true, bodies: true, features: true });

function isEntryDirty(entry: TimelineEntry): boolean {
  return entry.status === "dirty";
}

const kindColor = (kind: string): string => {
  const colors: Record<string, string> = {
    sketch: "oklch(0.78 0.13 75)",
    extrude: "oklch(0.70 0.13 233)",
    boolean: "oklch(0.65 0.14 300)",
    revolve: "oklch(0.68 0.16 180)",
    fillet: "oklch(0.72 0.14 120)",
    chamfer: "oklch(0.72 0.15 45)",
  };
  return colors[kind] ?? "oklch(0.66 0.01 250)";
};

function selectSketchRow(sketchId: string) {
  const entry = timelineEntries.value.find((e) => e.kind === "sketch" && e.sketch_id === sketchId);
  if (entry) selection.selectFeature(entry.id);
}

function selectBodyRow(bodyId: string) {
  const entry = timelineEntries.value.find(
    (e) => e.body_id === bodyId || e.result_body_id === bodyId,
  );
  if (entry) selection.selectFeature(entry.id);
}

// --- Rename (dblclick по строке) ---
const renamingId = ref<string | null>(null);
const renameValue = ref("");

function startRename(id: string, current: string) {
  renamingId.value = id;
  renameValue.value = current;
}

function focusRenameInput(el: unknown) {
  if (el instanceof HTMLInputElement && document.activeElement !== el) {
    el.focus();
    el.select();
  }
}

async function commitRename() {
  if (!renamingId.value) return;
  const id = renamingId.value;
  renamingId.value = null;
  await names.rename(props.projectId, id, renameValue.value);
}

function cancelRename() {
  renamingId.value = null;
}

const isRenaming = computed(() => renamingId.value !== null);

defineExpose({ startRename, cancelRename, isRenaming });
</script>

<template>
  <aside :class="$style.tree">
    <div :class="$style.panelHead">БРАУЗЕР МОДЕЛИ</div>
    <div :class="$style.treeBody">
      <div :class="$style.treeGroup" @click="open.origin = !open.origin">
        <span :class="[$style.caret, open.origin && $style.caretOpen]">▸</span>Начало координат
        <span :class="$style.treeCount">3</span>
      </div>
      <template v-if="open.origin">
        <div v-for="pl in ['Плоскость XY', 'Плоскость XZ', 'Плоскость YZ']" :key="pl" :class="$style.treeRow">
          <span :class="$style.treeDot" :style="{ background: 'oklch(0.40 0.06 233)' }" />{{ pl }}
        </div>
      </template>

      <div :class="$style.treeGroup" @click="open.sketches = !open.sketches">
        <span :class="[$style.caret, open.sketches && $style.caretOpen]">▸</span>Эскизы
        <span :class="$style.treeCount">{{ sketchCount }}</span>
      </div>
      <template v-if="open.sketches">
        <div
          v-for="s in sketches"
          :key="s.id"
          :class="$style.treeRow"
          :title="'Двойной клик — переименовать, правый — меню'"
          @click="selectSketchRow(s.id)"
          @dblclick="startRename(s.id, names.sketchLabel(s.id))"
          @contextmenu.prevent="emit('context-menu', $event, 'sketch', s.id)"
        >
          <span :class="$style.treeDot" :style="{ background: kindColor('sketch') }" />
          <input
            v-if="renamingId === s.id"
            :ref="focusRenameInput"
            v-model="renameValue"
            :class="$style.renameInput"
            @click.stop
            @keyup.enter="commitRename"
            @keyup.escape="cancelRename"
            @blur="commitRename"
          />
          <template v-else>{{ names.sketchLabel(s.id) }}</template>
        </div>
      </template>

      <div :class="$style.treeGroup" @click="open.bodies = !open.bodies">
        <span :class="[$style.caret, open.bodies && $style.caretOpen]">▸</span>Тела
        <span :class="$style.treeCount">{{ bodyCount }}</span>
      </div>
      <template v-if="open.bodies">
        <div
          v-for="b in bodies"
          :key="b.id"
          :class="$style.treeRow"
          :title="'Двойной клик — переименовать, правый — меню'"
          @click="selectBodyRow(b.id)"
          @dblclick="startRename(b.id, names.bodyLabel(b.id))"
          @contextmenu.prevent="emit('context-menu', $event, 'body', b.id)"
        >
          <span :class="$style.treeDot" :style="{ background: 'oklch(0.50 0.01 250)' }" />
          <input
            v-if="renamingId === b.id"
            :ref="focusRenameInput"
            v-model="renameValue"
            :class="$style.renameInput"
            @click.stop
            @keyup.enter="commitRename"
            @keyup.escape="cancelRename"
            @blur="commitRename"
          />
          <template v-else>{{ names.bodyLabel(b.id) }}</template>
          <span
            :class="$style.treeMeta"
            title="Кликните, чтобы скрыть/показать"
            @click.stop="emit('toggle-visibility', b.id)"
          >{{ b.visible !== false ? 'видимо' : 'скрыто' }}</span>
        </div>
      </template>

      <div :class="$style.treeGroup" @click="open.features = !open.features">
        <span :class="[$style.caret, open.features && $style.caretOpen]">▸</span>Элементы
        <span :class="$style.treeCount">{{ timelineCount }}</span>
      </div>
      <template v-if="open.features">
        <div
          v-for="e in timelineEntries"
          :key="e.id"
          :class="[$style.treeRow, selectedTimelineId === e.id && $style.treeRowActive, isEntryDirty(e) && $style.treeRowDirty]"
          @click="selection.selectFeature(e.id)"
          @dblclick="startRename(e.id, names.entryLabel(e))"
          @contextmenu.prevent="emit('context-menu', $event, 'feature', e.id)"
        >
          <span :class="$style.treeDot" :style="{ background: kindColor(e.kind) }" />
          <input
            v-if="renamingId === e.id"
            :ref="focusRenameInput"
            v-model="renameValue"
            :class="$style.renameInput"
            @click.stop
            @keyup.enter="commitRename"
            @keyup.escape="cancelRename"
            @blur="commitRename"
          />
          <template v-else>{{ names.entryLabel(e) }}</template>
          <span v-if="isEntryDirty(e)" :class="$style.dirtyIcon" title="Требуется перестроение — параметры изменились">⚠</span>
        </div>
      </template>
    </div>
  </aside>
</template>

<style module>
.tree {
  width: 266px;
  flex-shrink: 0;
  border-right: 1px solid var(--cs-border-subtle);
  background: var(--cs-surface-alt);
  display: flex;
  flex-direction: column;
}

.panelHead {
  font-family: var(--cs-font-mono);
  font-size: 11px;
  color: var(--cs-text-secondary);
  letter-spacing: 0.04em;
  height: 38px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  border-bottom: 1px solid var(--cs-border-subtle);
}

.treeBody {
  flex: 1;
  overflow: auto;
  padding: 8px 0;
}

.treeGroup {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
  font-weight: var(--cs-font-weight-medium);
  color: var(--cs-text);
}

.treeGroup:hover {
  background: var(--cs-surface-hover);
}

.caret {
  display: inline-block;
  font-size: 9px;
  color: var(--cs-text-secondary);
  transition: transform 0.12s;
}

.caretOpen {
  transform: rotate(90deg);
}

.treeCount {
  margin-left: auto;
  font-family: var(--cs-font-mono);
  font-size: 10px;
  color: var(--cs-text-muted);
}

.treeRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px 5px 30px;
  cursor: pointer;
  font-size: 13px;
  color: var(--cs-text-secondary);
  border-left: 2px solid transparent;
}

.treeRow:hover {
  background: var(--cs-surface-hover);
}

.treeRowActive {
  color: var(--cs-text);
  background: var(--cs-primary-soft);
  border-left-color: var(--cs-primary);
}

.treeRowDirty {
  color: var(--cs-amber-strong);
}

.dirtyIcon {
  margin-left: auto;
  font-size: 12px;
  flex-shrink: 0;
}

.treeDot {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  border-radius: 3px;
}

.treeMeta {
  margin-left: auto;
  font-family: var(--cs-font-mono);
  font-size: 10px;
  color: var(--cs-text-muted);
}

.treeMeta:hover {
  color: var(--cs-text);
  text-decoration: underline;
}

.renameInput {
  flex: 1;
  min-width: 0;
  background: var(--cs-surface);
  border: 1px solid var(--cs-primary);
  border-radius: 4px;
  color: var(--cs-text);
  font-size: 12.5px;
  padding: 1px 6px;
  outline: none;
}
</style>
