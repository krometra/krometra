<script setup lang="ts">
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

const renderingBtns: { mode: RenderingMode; icon: IconName; title: string }[] = [
  { mode: "shaded", icon: "shaded", title: "Заливка" },
  { mode: "shaded_edges", icon: "shadedEdges", title: "Заливка с рёбрами" },
  { mode: "hidden_line", icon: "hiddenLine", title: "Без заливки, только видимые рёбра" },
  { mode: "wireframe", icon: "wireframe", title: "Каркас" },
];
</script>

<template>
  <div :class="$style.viewControls">
    <KrButton
      variant="ghost"
      size="sm"
      :class="$style.viewBtn"
      title="Вписать всё в экран"
      aria-label="Вписать всё в экран"
      @click="emit('fit-all')"
    >
      <KrIcon name="fitAll" :size="17" />
    </KrButton>
    <KrButton
      variant="ghost"
      size="sm"
      :class="$style.viewBtn"
      title="Вид по нормали к выбранной грани"
      aria-label="Вид по нормали к выбранной грани"
      data-testid="view-look-at"
      @click="emit('look-at')"
    >
      <KrIcon name="lookAt" :size="17" />
    </KrButton>
    <KrButton
      variant="ghost"
      size="sm"
      :class="[$style.viewBtn, sectionActive && $style.viewBtnActive]"
      title="Сечение модели"
      aria-label="Сечение модели"
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
