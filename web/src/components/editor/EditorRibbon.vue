<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import KrIcon from "@/components/ui/KrIcon.vue";
import type { RibbonAction } from "@/composables/editor/types";
import { LOFT_ICON } from "@/lib/loftFeature";

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

const { t } = useI18n();

const tools = computed<Tool[]>(() => {
  const bodies = props.bodyCount ?? 0;
  return [
    { label: t("editor.sketch"), icon: "M3 3h18v18H3z M9 3v18", action: "sketch", hint: t("editor.sketchHint"), testId: "ribbon-sketch" },
    { label: t("editor.plane"), icon: "M3 17l6-10h12l-6 10z M12 3v6", action: "plane", hint: t("editor.planeHint"), testId: "ribbon-plane" },
    { divider: true },
    { label: t("editor.extrude"), icon: "M5 8l7-5 7 5 M5 8v8l7 5 7-5V8 M12 3v18", action: "extrude", hint: t("editor.extrudeHint"), testId: "ribbon-extrude" },
    { label: t("editor.revolve"), icon: "M4 12a8 8 0 1 1 8 8 M12 4v8l5 3", action: "revolve", hint: t("editor.revolveHint"), testId: "ribbon-revolve" },
    { label: t("editor.sweep"), icon: "M3 18c6 0 6-12 12-12 M15 6l3-2 0 4z", action: "sweep", hint: t("editor.sweepHint"), testId: "ribbon-sweep" },
    { label: t("editor.loft"), icon: LOFT_ICON, action: "loft", hint: t("editor.loftHint"), testId: "ribbon-loft" },
    { divider: true },
    {
      label: t("editor.boolean"),
      icon: "M4 4h10v10H4z M10 10h10v10H10z",
      action: "boolean",
      disabled: bodies < 2,
      testId: "ribbon-boolean",
      hint: bodies < 2
        ? t("editor.booleanNeed")
        : t("editor.booleanHint"),
    },
    { divider: true },
    { label: t("editor.fillet"), icon: "M4 20V10a6 6 0 0 1 6-6h10", action: "fillet", disabled: bodies < 1, hint: bodies < 1 ? t("editor.needBody") : t("editor.filletHint"), testId: "ribbon-fillet" },
    { label: t("editor.chamfer"), icon: "M4 20L20 4 M4 14v6h6", action: "chamfer", disabled: bodies < 1, hint: bodies < 1 ? t("editor.needBody") : t("editor.chamferHint"), testId: "ribbon-chamfer" },
    { label: t("editor.thread"), icon: "M6 4h12 M6 8h12 M6 12h12 M6 16h12 M6 20h12 M8 2v20 M16 2v20", action: "thread", disabled: bodies < 1, testId: "ribbon-thread", hint: bodies < 1 ? t("editor.needBody") : t("editor.threadHint") },
    { label: t("editor.hole"), icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", action: "hole", disabled: bodies < 1, testId: "ribbon-hole", hint: bodies < 1 ? t("editor.needBody") : t("editor.holeHint") },
    { label: t("editor.shell"), icon: "M5 8l7-5 7 5 M5 8v8l7 5 7-5V8 M9 10v4l3 2 3-2v-4", action: "shell", disabled: bodies < 1, testId: "ribbon-shell", hint: bodies < 1 ? t("editor.needBody") : t("editor.shellHint") },
    { label: t("editor.draft"), icon: "M8 4h8l3 16H5z M12 4v16", action: "draft", disabled: bodies < 1, testId: "ribbon-draft", hint: bodies < 1 ? t("editor.needBody") : t("editor.draftHint") },
    { label: t("editor.pressPull"), icon: "M4 14h16 M12 14V4 M8 8l4-4 4 4 M4 20h16", action: "press_pull", disabled: bodies < 1, testId: "ribbon-press-pull", hint: bodies < 1 ? t("editor.needBody") : t("editor.pressPullHint") },
    { divider: true },
    { label: t("editor.pattern"), icon: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z", action: "pattern", disabled: bodies < 1, testId: "ribbon-pattern", hint: bodies < 1 ? t("editor.needBody") : t("editor.patternHint") },
    { label: t("editor.mirror"), icon: "M12 3v18 M7 7l-3 5 3 5 M17 7l3 5-3 5", action: "mirror", disabled: bodies < 1, testId: "ribbon-mirror", hint: bodies < 1 ? t("editor.needBody") : t("editor.mirrorHint") },
    { divider: true },
    { label: t("editor.measure"), icon: "M3 17L17 3l4 4L7 21z M7 13l2 2 M10 10l2 2 M13 7l2 2", action: "measure", disabled: bodies < 1, testId: "ribbon-measure", hint: bodies < 1 ? t("editor.needBody") : t("editor.measureHint") },
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
      :title="t('editor.undoHint')"
      data-testid="ribbon-undo"
      :disabled="!props.canUndo"
      @click="emit('undo')"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3" />
      </svg>
      <span :class="$style.toolLabel">{{ t("editor.undo") }}</span>
    </button>
    <button
      :class="[$style.tool, !props.canRedo && $style.toolDisabled]"
      :title="t('editor.redoHint')"
      data-testid="ribbon-redo"
      :disabled="!props.canRedo"
      @click="emit('redo')"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 14l5-5-5-5 M20 9H9a5 5 0 0 0 0 10h3" />
      </svg>
      <span :class="$style.toolLabel">{{ t("editor.redo") }}</span>
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

    <button :class="[$style.tool, $style.help]" :title="t('editor.shortcutsHint')" @click="emit('show-shortcuts')">
      <KrIcon name="keyboard" :size="20" />
      <span :class="$style.toolLabel">{{ t("editor.shortcuts") }}</span>
    </button>
  </div>
</template>

<style module>
.ribbon {
  height: 62px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--kr-border-subtle);
  background: var(--kr-surface-alt);
  display: flex;
  align-items: stretch;
  padding: 0 12px;
  gap: 2px;
}

.ribbonDiv {
  width: 1px;
  background: var(--kr-border);
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
  color: var(--kr-text-secondary);
  background: transparent;
  border: none;
  border-radius: 8px;
  margin: 7px 0;
  transition: background var(--kr-transition-fast), color var(--kr-transition-fast);
}

.tool:hover {
  background: var(--kr-surface-hover);
  color: var(--kr-text);
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
  color: var(--kr-text-disabled);
  cursor: default;
}
</style>
