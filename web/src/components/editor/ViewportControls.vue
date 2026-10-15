<script setup lang="ts">
import CsButton from "@/components/ui/CsButton.vue";
import CsIcon from "@/components/ui/CsIcon.vue";
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
    <CsButton
      variant="ghost"
      size="sm"
      :class="$style.viewBtn"
      title="Вписать всё в экран"
      aria-label="Вписать всё в экран"
      @click="emit('fit-all')"
    >
      <CsIcon name="fitAll" :size="17" />
    </CsButton>
    <CsButton
      variant="ghost"
      size="sm"
      :class="$style.viewBtn"
      title="Вид по нормали к выбранной грани"
      aria-label="Вид по нормали к выбранной грани"
      data-testid="view-look-at"
      @click="emit('look-at')"
    >
      <CsIcon name="lookAt" :size="17" />
    </CsButton>
    <CsButton
      variant="ghost"
      size="sm"
      :class="[$style.viewBtn, sectionActive && $style.viewBtnActive]"
      title="Сечение модели"
      aria-label="Сечение модели"
      :aria-pressed="!!sectionActive"
      data-testid="view-section"
      @click="emit('toggle-section')"
    >
      <CsIcon name="section" :size="17" />
    </CsButton>
    <div :class="$style.vSep" />
    <CsButton
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
      <CsIcon :name="b.icon" :size="17" />
    </CsButton>
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
  box-shadow: var(--cs-shadow-sm);
  border: 1px solid var(--cs-border-strong);
  border-radius: 9px;
  padding: 5px;
  backdrop-filter: blur(6px);
}

/* Квадратная иконочная кнопка: перебиваем размеры CsButton size="sm". */
.viewBtn.viewBtn {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 6px;
  color: var(--cs-text-secondary);
  font-family: var(--cs-font-mono);
  font-size: 13px;
}

.viewBtn:hover {
  background: var(--cs-surface-hover);
  color: var(--cs-text);
}

.viewBtnActive.viewBtnActive,
.viewBtnActive.viewBtnActive:hover {
  background: var(--cs-primary);
  color: var(--cs-primary-fg);
}

.vSep {
  width: 1px;
  height: 20px;
  background: var(--cs-border-strong);
  margin: 0 2px;
}
</style>
