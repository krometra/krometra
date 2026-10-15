<script setup lang="ts">
import { computed } from "vue";
import CsIcon from "@/components/ui/CsIcon.vue";
import type { RibbonAction } from "@/composables/editor/types";

interface Tool {
  label?: string;
  icon?: string;
  action?: RibbonAction;
  divider?: boolean;
  disabled?: boolean;
  hint?: string;
  testId?: string;
}

const emit = defineEmits<{
  action: [action: RibbonAction];
  undo: [];
  redo: [];
  "show-shortcuts": [];
}>();

const props = defineProps<{
  canUndo?: boolean;
  canRedo?: boolean;
  bodyCount?: number;
}>();

const tools = computed<Tool[]>(() => {
  const bodies = props.bodyCount ?? 0;
  return [
    { label: "Эскиз", icon: "M3 3h18v18H3z M9 3v18", action: "sketch", hint: "Создать эскиз — S", testId: "ribbon-sketch" },
    { divider: true },
    { label: "Выдавить", icon: "M5 8l7-5 7 5 M5 8v8l7 5 7-5V8 M12 3v18", action: "extrude", hint: "Выдавить эскиз в тело — E", testId: "ribbon-extrude" },
    { label: "Вращать", icon: "M4 12a8 8 0 1 1 8 8 M12 4v8l5 3", action: "revolve", hint: "Тело вращения из эскиза — R", testId: "ribbon-revolve" },
    { label: "По траект.", icon: "M3 18c6 0 6-12 12-12 M15 6l3-2 0 4z", disabled: true, hint: "В разработке" },
    { divider: true },
    {
      label: "Комбинировать",
      icon: "M4 4h10v10H4z M10 10h10v10H10z",
      action: "boolean",
      disabled: bodies < 2,
      testId: "ribbon-boolean",
      hint: bodies < 2
        ? "Объединить, вырезать, пересечь — нужно минимум два тела"
        : "Объединить, вырезать или пересечь тела",
    },
    { divider: true },
    { label: "Скругление", icon: "M4 20V10a6 6 0 0 1 6-6h10", action: "fillet", disabled: bodies < 1, hint: bodies < 1 ? "Сначала постройте тело" : "Скругление рёбер — F", testId: "ribbon-fillet" },
    { label: "Фаска", icon: "M4 20L20 4 M4 14v6h6", action: "chamfer", disabled: bodies < 1, hint: bodies < 1 ? "Сначала постройте тело" : "Фаска на рёбрах — Shift+F", testId: "ribbon-chamfer" },
    { label: "Резьба", icon: "M6 4h12 M6 8h12 M6 12h12 M6 16h12 M6 20h12 M8 2v20 M16 2v20", action: "thread", disabled: bodies < 1, testId: "ribbon-thread", hint: bodies < 1 ? "Сначала постройте тело" : "Резьба на цилиндрической грани — внешняя или внутренняя" },
    { label: "Отверстие", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", disabled: true, hint: "В разработке" },
    { label: "Оболочка", icon: "M5 8l7-5 7 5 M5 8v8l7 5 7-5V8 M9 10v4l3 2 3-2v-4", disabled: true, hint: "В разработке" },
    { divider: true },
    { label: "Массив", icon: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z", disabled: true, hint: "В разработке" },
    { label: "Зеркало", icon: "M12 3v18 M7 7l-3 5 3 5 M17 7l3 5-3 5", disabled: true, hint: "В разработке" },
    { divider: true },
    { label: "Измерить", icon: "M3 17L17 3l4 4L7 21z M7 13l2 2 M10 10l2 2 M13 7l2 2", action: "measure", disabled: bodies < 1, testId: "ribbon-measure", hint: bodies < 1 ? "Сначала постройте тело" : "Расстояние, угол, длина, площадь, объём и масса" },
  ];
});

function onToolClick(t: Tool) {
  if (t.action) emit("action", t.action);
}
</script>

<template>
  <div :class="$style.ribbon">
    <button
      :class="[$style.tool, !props.canUndo && $style.toolDisabled]"
      title="Отменить (Ctrl+Z)"
      data-testid="ribbon-undo"
      :disabled="!props.canUndo"
      @click="emit('undo')"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3" />
      </svg>
      <span :class="$style.toolLabel">Отменить</span>
    </button>
    <button
      :class="[$style.tool, !props.canRedo && $style.toolDisabled]"
      title="Повторить (Ctrl+Y)"
      data-testid="ribbon-redo"
      :disabled="!props.canRedo"
      @click="emit('redo')"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 14l5-5-5-5 M20 9H9a5 5 0 0 0 0 10h3" />
      </svg>
      <span :class="$style.toolLabel">Повторить</span>
    </button>
    <div :class="$style.ribbonDiv" />
    <template v-for="(t, i) in tools" :key="i">
      <div v-if="t.divider" :class="$style.ribbonDiv" />
      <button
        v-else
        :class="[$style.tool, t.disabled && $style.toolDisabled]"
        :title="t.hint"
        :data-testid="t.testId"
        :disabled="t.disabled"
        @click="onToolClick(t)"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path :d="t.icon" />
        </svg>
        <span :class="$style.toolLabel">{{ t.label }}</span>
      </button>
    </template>

    <button :class="[$style.tool, $style.help]" title="Горячие клавиши — ?" @click="emit('show-shortcuts')">
      <CsIcon name="keyboard" :size="20" />
      <span :class="$style.toolLabel">Клавиши</span>
    </button>
  </div>
</template>

<style module>
.ribbon {
  height: 62px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--cs-border-subtle);
  background: var(--cs-surface-alt);
  display: flex;
  align-items: stretch;
  padding: 0 12px;
  gap: 2px;
}

.ribbonDiv {
  width: 1px;
  background: var(--cs-border);
  margin: 12px 8px;
}

.tool {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 58px;
  padding: 0 6px;
  cursor: pointer;
  color: var(--cs-text-secondary);
  background: transparent;
  border: none;
  border-radius: 8px;
  margin: 7px 0;
  transition: background var(--cs-transition-fast), color var(--cs-transition-fast);
}

.tool:hover {
  background: var(--cs-surface-hover);
  color: var(--cs-text);
}

.toolLabel {
  font-size: 10.5px;
  white-space: nowrap;
}

.tool:disabled {
  cursor: default;
}

.help {
  margin-left: auto;
  width: auto;
  padding: 0 12px;
}

.toolDisabled,
.toolDisabled:hover {
  background: transparent;
  color: var(--cs-text-disabled);
  cursor: default;
}
</style>
