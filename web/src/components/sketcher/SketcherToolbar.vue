<script setup lang="ts">
// Тулбар эскиза: отмена/повтор, инструменты рисования, вспомогательные прямые,
// переключатель привязки.
import type { SketchTool as SketchToolName } from "@/composables/shared/useSketch";

defineProps<{
  tool: SketchToolName;
  canUndo: boolean;
  canRedo: boolean;
  snapEnabled: boolean;
  auxHint: string | null;
}>();

const emit = defineEmits<{
  (e: "select-tool", tool: SketchToolName): void;
  (e: "undo"): void;
  (e: "redo"): void;
  (e: "toggle-snap"): void;
}>();

const DRAW_TOOLS = [
  { id: "line", label: "Линия", title: "Линия (L)" },
  { id: "rectangle", label: "Прямоуг.", title: "Прямоугольник (R)" },
  { id: "circle", label: "Окруж.", title: "Окружность (C)" },
  { id: "arc", label: "Дуга", title: "Дуга (A)" },
] as const;

const AUX_BUTTONS = [
  { id: "aux-parallel", label: "Паралл.", icon: "M7 4v16 M17 4v16" },
  { id: "aux-perpendicular", label: "Перпенд.", icon: "M4 20h16 M12 20V4" },
  { id: "aux-vertical", label: "Верт.", icon: "M12 3v18 M12 3l-2 3 M12 3l2 3" },
  { id: "aux-horizontal", label: "Гориз.", icon: "M3 12h18 M21 12l-3-2 M21 12l-3 2" },
] as const;

function select(tool: SketchToolName) {
  emit("select-tool", tool);
}
</script>

<template>
  <div :class="$style.toolbar" data-sketch-ui>
    <button :class="$style.toolBtn" :disabled="!canUndo" title="Отменить (Ctrl+Z)" @click="emit('undo')">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 14L4 9l5-5" />
        <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
      </svg>
      <span :class="$style.toolLabel">Отменить</span>
    </button>
    <button :class="$style.toolBtn" :disabled="!canRedo" title="Повторить (Ctrl+Y)" @click="emit('redo')">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 14l5-5-5-5" />
        <path d="M20 9H9a5 5 0 0 0 0 10h3" />
      </svg>
      <span :class="$style.toolLabel">Повторить</span>
    </button>

    <div :class="$style.toolbarDivider" />

    <button
      :class="[$style.toolBtn, tool === 'select' && $style.toolBtnActive]"
      title="Выбор (V)"
      @click="select('select')"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 3l14 8-6 1.5L10 19z" />
      </svg>
      <span :class="$style.toolLabel">Выбор</span>
    </button>

    <div :class="$style.toolbarDivider" />

    <button
      v-for="t in DRAW_TOOLS"
      :key="t.id"
      :class="[$style.toolBtn, tool === t.id && $style.toolBtnActive]"
      :title="t.title"
      @click="select(t.id)"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <line v-if="t.id === 'line'" x1="4" y1="20" x2="20" y2="4" />
        <rect v-if="t.id === 'rectangle'" x="3" y="3" width="18" height="18" rx="2" />
        <circle v-if="t.id === 'circle'" cx="12" cy="12" r="9" />
        <path v-if="t.id === 'arc'" d="M4 18a9 9 0 0 1 9-7" />
        <line v-if="t.id === 'arc'" x1="12" y1="12" x2="13" y2="11" />
        <line v-if="t.id === 'arc'" x1="12" y1="12" x2="4" y2="18" />
      </svg>
      <span :class="$style.toolLabel">{{ t.label }}</span>
    </button>

    <div :class="$style.toolbarDivider" />

    <button
      v-for="t in AUX_BUTTONS"
      :key="t.id"
      :class="[$style.toolBtn, $style.auxBtn, tool === t.id && $style.toolBtnActive]"
      :title="`Вспомогательная прямая: ${t.label}`"
      @click="select(t.id)"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="4 2">
        <path :d="t.icon" />
      </svg>
      <span :class="$style.toolLabel">{{ t.label }}</span>
    </button>

    <div :class="$style.toolbarDivider" />

    <button
      :class="[$style.toolBtn, snapEnabled && $style.toolBtnActive]"
      title="Привязка к вспомогательным прямым и пересечениям"
      @click="emit('toggle-snap')"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M6 4v7a6 6 0 0 0 12 0V4" />
        <path d="M6 4v4 M18 4v4" stroke-width="3" />
      </svg>
      <span :class="$style.toolLabel">Привязка</span>
    </button>

    <span v-if="auxHint" :class="$style.auxHint">{{ auxHint }}</span>
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
  background: var(--cs-surface-alt, #1e1e30);
  border-bottom: 1px solid var(--cs-border-subtle, #333);
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
  color: var(--cs-text-secondary, #aaa);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.12s;
}

.toolBtn:hover {
  background: var(--cs-surface-hover, rgba(255, 255, 255, 0.05));
  color: var(--cs-text, #eee);
}

.toolBtn:disabled,
.toolBtn:disabled:hover {
  background: transparent;
  color: var(--cs-text-disabled);
  cursor: default;
}

.toolBtn:disabled:hover {
  background: transparent;
  color: var(--cs-text-secondary, #aaa);
}

.toolBtnActive {
  background: color-mix(in oklch, var(--cs-primary, #4a7dff) 20%, transparent);
  color: var(--cs-primary, #4a7dff);
}

.toolLabel {
  font-family: var(--cs-font-mono, monospace);
  font-size: 11px;
}

.toolbarDivider {
  width: 1px;
  height: 24px;
  flex-shrink: 0;
  background: var(--cs-border-subtle, #333);
  margin: 0 6px;
}

.auxBtn {
  color: var(--cs-teal-strong);
}

.auxHint {
  margin-left: 12px;
  font-size: 11px;
  font-family: var(--cs-font-mono, monospace);
  color: var(--cs-teal-strong);
}
</style>
