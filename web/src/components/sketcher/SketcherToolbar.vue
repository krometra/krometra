<script setup lang="ts">
import { useSketchText } from "@/composables/sketcher/useSketchText";
const tr = useSketchText();
// Тулбар эскиза: отмена/повтор, инструменты рисования, вспомогательные прямые,
// переключатель привязки.
import { computed } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import type { SketchTool as SketchToolName } from "@/composables/shared/useSketch";

defineProps<{
  tool: SketchToolName;
  canUndo: boolean;
  canRedo: boolean;
  snapEnabled: boolean;
  constructionMode: boolean;
  auxHint: string | null;
}>();

const emit = defineEmits<{
  (e: "select-tool", tool: SketchToolName): void;
  (e: "undo"): void;
  (e: "redo"): void;
  (e: "toggle-snap"): void;
  (e: "toggle-construction"): void;
}>();

const { t } = useI18n();

const DRAW_TOOLS = computed(() => [
  { id: "line", label: t("sketch.line"), title: t("sketch.lineHint") },
  { id: "rectangle", label: t("sketch.rectangle"), title: t("sketch.rectangleHint") },
  { id: "circle", label: t("sketch.circle"), title: t("sketch.circleHint") },
  { id: "arc", label: t("sketch.arc"), title: t("sketch.arcHint") },
  { id: "arc3", label: t("sketch.arc3"), title: t("sketch.arc3Hint") },
  { id: "dimension", label: t("sketch.dimension"), title: t("sketch.dimensionHint") },
  { id: "fillet", label: t("sketch.fillet"), title: t("sketch.filletHint") },
  { id: "trim", label: t("sketch.trim"), title: t("sketch.trimHint") },
] as const);

const AUX_BUTTONS = computed(() => [
  { id: "aux-parallel", label: t("sketch.parallel"), icon: "M7 4v16 M17 4v16" },
  { id: "aux-perpendicular", label: t("sketch.perpendicular"), icon: "M4 20h16 M12 20V4" },
  { id: "aux-vertical", label: t("sketch.vertical"), icon: "M12 3v18 M12 3l-2 3 M12 3l2 3" },
  { id: "aux-horizontal", label: t("sketch.horizontal"), icon: "M3 12h18 M21 12l-3-2 M21 12l-3 2" },
] as const);

function select(tool: SketchToolName) {
  emit("select-tool", tool);
}
</script>

<template>
  <div :class="$style.toolbar" data-sketch-ui>
    <button :class="$style.toolBtn" :disabled="!canUndo" :title="t('editor.undoHint')" @click="emit('undo')">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 14L4 9l5-5" />
        <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
      </svg>
      <span :class="$style.toolLabel">{{ t("editor.undo") }}</span>
    </button>
    <button :class="$style.toolBtn" :disabled="!canRedo" :title="t('editor.redoHint')" @click="emit('redo')">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 14l5-5-5-5" />
        <path d="M20 9H9a5 5 0 0 0 0 10h3" />
      </svg>
      <span :class="$style.toolLabel">{{ t("editor.redo") }}</span>
    </button>

    <div :class="$style.toolbarDivider" />

    <button
      :class="[$style.toolBtn, tool === 'select' && $style.toolBtnActive]"
      :title="t('sketch.selectHint')"
      @click="select('select')"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 3l14 8-6 1.5L10 19z" />
      </svg>
      <span :class="$style.toolLabel">{{ t("sketch.select") }}</span>
    </button>

    <div :class="$style.toolbarDivider" />

    <button
      v-for="t in DRAW_TOOLS"
      :key="t.id"
      :class="[$style.toolBtn, tool === t.id && $style.toolBtnActive]"
      :title="t.title"
      :data-testid="`sketch-tool-${t.id}`"
      @click="select(t.id)"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <line v-if="t.id === 'line'" x1="4" y1="20" x2="20" y2="4" />
        <rect v-if="t.id === 'rectangle'" x="3" y="3" width="18" height="18" rx="2" />
        <circle v-if="t.id === 'circle'" cx="12" cy="12" r="9" />
        <path v-if="t.id === 'arc'" d="M4 18a9 9 0 0 1 9-7" />
        <line v-if="t.id === 'arc'" x1="12" y1="12" x2="13" y2="11" />
        <line v-if="t.id === 'arc'" x1="12" y1="12" x2="4" y2="18" />
        <path v-if="t.id === 'arc3'" d="M4 17a9 9 0 0 1 16 0" />
        <circle v-if="t.id === 'arc3'" cx="4" cy="17" r="1.5" />
        <circle v-if="t.id === 'arc3'" cx="12" cy="9" r="1.5" />
        <circle v-if="t.id === 'arc3'" cx="20" cy="17" r="1.5" />
        <path v-if="t.id === 'dimension'" d="M4 8v8 M20 8v8 M4 12h16 M7 9l-3 3 3 3 M17 9l3 3-3 3" />
        <path v-if="t.id === 'fillet'" d="M4 20V12a8 8 0 0 1 8-8h8" />
        <path v-if="t.id === 'trim'" d="M3 12h7 M12 4v16" />
        <path v-if="t.id === 'trim'" d="M14 12h7" stroke-dasharray="2 2.5" />
      </svg>
      <span :class="$style.toolLabel">{{ t.label }}</span>
    </button>

    <button
      :class="[$style.toolBtn, $style.auxBtn, constructionMode && $style.toolBtnActive]"
      :aria-pressed="constructionMode"
      :title="t('sketch.constructionHint')"
      data-testid="sketch-construction-toggle"
      @click="emit('toggle-construction')"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="3 3">
        <path d="M4 20L20 4" />
        <circle cx="12" cy="12" r="7" />
      </svg>
      <span :class="$style.toolLabel">{{ t("sketch.construction") }}</span>
    </button>

    <div :class="$style.toolbarDivider" />

    <button
      v-for="aux in AUX_BUTTONS"
      :key="aux.id"
      :class="[$style.toolBtn, $style.auxBtn, tool === aux.id && $style.toolBtnActive]"
      :title="t('sketch.auxHint', { name: aux.label })"
      @click="select(aux.id)"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="4 2">
        <path :d="aux.icon" />
      </svg>
      <span :class="$style.toolLabel">{{ aux.label }}</span>
    </button>

    <div :class="$style.toolbarDivider" />

    <button
      :class="[$style.toolBtn, snapEnabled && $style.toolBtnActive]"
      :aria-pressed="snapEnabled"
      :title="t('sketch.snapHint')"
      @click="emit('toggle-snap')"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M6 4v7a6 6 0 0 0 12 0V4" />
        <path d="M6 4v4 M18 4v4" stroke-width="3" />
      </svg>
      <span :class="$style.toolLabel">{{ t("sketch.snap") }}</span>
    </button>

    <span v-if="auxHint" :class="$style.auxHint">{{ tr(auxHint) }}</span>
  </div>
</template>

<style module>
.toolbar {
  min-height: 44px;
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  box-sizing: border-box;
  background: var(--kr-surface-alt, #1e1e30);
  border-bottom: 1px solid var(--kr-border-subtle, #333);
}

.toolBtn {
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--kr-text-secondary, #aaa);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.12s;
}

.toolBtn:hover {
  background: var(--kr-surface-hover, rgba(255, 255, 255, 0.05));
  color: var(--kr-text, #eee);
}

.toolBtn:disabled,
.toolBtn:disabled:hover {
  background: transparent;
  color: var(--kr-text-disabled);
  cursor: default;
}

.toolBtn:disabled:hover {
  background: transparent;
  color: var(--kr-text-secondary, #aaa);
}

.toolBtnActive {
  background: color-mix(in oklch, var(--kr-primary, #4a7dff) 20%, transparent);
  color: var(--kr-primary, #4a7dff);
}

.toolLabel {
  font-family: var(--kr-font-mono, monospace);
  font-size: 11px;
}

.toolbarDivider {
  width: 1px;
  height: 24px;
  flex-shrink: 0;
  background: var(--kr-border-subtle, #333);
  margin: 0 6px;
}

.auxBtn {
  color: var(--kr-teal-strong);
}

.auxHint {
  margin-left: 12px;
  font-size: 11px;
  font-family: var(--kr-font-mono, monospace);
  color: var(--kr-teal-strong);
}
</style>
