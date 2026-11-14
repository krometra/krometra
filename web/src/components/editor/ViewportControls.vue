<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
const { t } = useI18n();
import KrButton from "@/components/ui/KrButton.vue";
import KrIcon from "@/components/ui/KrIcon.vue";
import NavigationMenu from "./NavigationMenu.vue";
import type { IconName } from "@/components/ui/icons";
import type { RenderingMode } from "@/composables/editor/types";

const renderingMode = defineModel<RenderingMode>("renderingMode", { required: true });

defineProps<{ sectionActive?: boolean }>();

const emit = defineEmits<{
  "fit-all": [];
  "look-at": [];
  "toggle-section": [];
}>();

const renderingBtns = computed<{ mode: RenderingMode; icon: IconName; title: string }[]>(() => [
  { mode: "shaded", icon: "shaded", title: t("editorPanels.shaded") },
  { mode: "shaded_edges", icon: "shadedEdges", title: t("editorPanels.shaded_edges") },
  { mode: "hidden_line", icon: "hiddenLine", title: t("editorPanels.hidden_line") },
  { mode: "wireframe", icon: "wireframe", title: t("editorPanels.wireframe") },
]);
</script>

<template>
  <div :class="$style.viewControls">
    <KrButton
      variant="ghost"
      size="sm"
      :class="$style.viewBtn"
      :title="t('editorPanels.fit_all')"
      :aria-label="t('editorPanels.fit_all')"
      @click="emit('fit-all')"
    >
      <KrIcon name="fitAll" :size="17" />
    </KrButton>
    <KrButton
      variant="ghost"
      size="sm"
      :class="$style.viewBtn"
      :title="t('editorPanels.look_normal')"
      :aria-label="t('editorPanels.look_normal')"
      data-testid="view-look-at"
      @click="emit('look-at')"
    >
      <KrIcon name="lookAt" :size="17" />
    </KrButton>
    <KrButton
      variant="ghost"
      size="sm"
      :class="[$style.viewBtn, sectionActive && $style.viewBtnActive]"
      :title="t('editorPanels.model_section')"
      :aria-label="t('editorPanels.model_section')"
      :aria-pressed="!!sectionActive"
      data-testid="view-section"
      @click="emit('toggle-section')"
    >
      <KrIcon name="section" :size="17" />
    </KrButton>
    <div :class="$style.vSep" />
    <KrButton
      v-for="b in renderingBtns"
      variant="ghost"
      size="sm"
      :key="b.mode"
      :class="[$style.viewBtn, renderingMode === b.mode && $style.viewBtnActive]"
      :title="b.title"
      :aria-label="b.title"
      :aria-pressed="renderingMode === b.mode"
      @click="renderingMode = b.mode"
    >
      <KrIcon :name="b.icon" :size="17" />
    </KrButton>
    <div :class="$style.vSep" />
    <NavigationMenu />
  </div>
</template>

<style module>
.viewControls {
  position: absolute;
  bottom: 16px;
  right: 18px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: oklch(1 0 0 / 0.88);
  box-shadow: var(--kr-shadow-sm);
  border: 1px solid var(--kr-border-strong);
  border-radius: 9px;
  padding: 5px;
  backdrop-filter: blur(6px);
}

/* Квадратная иконочная кнопка: перебиваем размеры KrButton size="sm". */
.viewBtn.viewBtn {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 6px;
  color: var(--kr-text-secondary);
  font-family: var(--kr-font-mono);
  font-size: 13px;
}

.viewBtn:hover {
  background: var(--kr-surface-hover);
  color: var(--kr-text);
}

.viewBtnActive.viewBtnActive,
.viewBtnActive.viewBtnActive:hover {
  background: var(--kr-primary);
  color: var(--kr-primary-fg);
}

.vSep {
  width: 1px;
  height: 20px;
  background: var(--kr-border-strong);
  margin: 0 2px;
}
</style>
