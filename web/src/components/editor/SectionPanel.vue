<script setup lang="ts">
import KrButton from "@/components/ui/KrButton.vue";
import KrIcon from "@/components/ui/KrIcon.vue";
import KrNumberInput from "@/components/ui/KrNumberInput.vue";
import KrSlider from "@/components/ui/KrSlider.vue";
import type { SectionModeApi } from "@/composables/editor/useSectionMode";
import type { SectionBase } from "@/lib/sectionPlane";

const props = defineProps<{ section: SectionModeApi }>();

const emit = defineEmits<{ "look-at": [] }>();

const basePlanes: SectionBase[] = ["XY", "XZ", "YZ"];
</script>

<template>
  <div :class="$style.panel" data-testid="section-panel" role="group" aria-label="Сечение модели">
    <div :class="$style.head">
      <span :class="$style.title">Сечение</span>
      <KrButton
        variant="ghost"
        size="sm"
        :class="$style.iconBtn"
        title="Выключить сечение (Esc)"
        aria-label="Выключить сечение"
        data-testid="section-close"
        @click="props.section.close()"
      >
        <KrIcon name="close" :size="15" />
      </KrButton>
    </div>

    <div :class="$style.planes">
      <KrButton
        v-for="plane in basePlanes"
        :key="plane"
        variant="ghost"
        size="sm"
        :class="[$style.planeBtn, props.section.source.value === plane && $style.planeBtnActive]"
        :aria-pressed="props.section.source.value === plane"
        :data-testid="`section-plane-${plane}`"
        @click="props.section.setBase(plane)"
      >
        {{ plane }}
      </KrButton>
      <KrButton
        variant="ghost"
        size="sm"
        :class="[$style.planeBtn, props.section.source.value === 'face' && $style.planeBtnActive]"
        :aria-pressed="props.section.source.value === 'face'"
        :disabled="!props.section.selectedFace.value"
        title="Сечение по выбранной плоской грани"
        data-testid="section-plane-face"
        @click="props.section.setSelectedFace()"
      >
        Грань
      </KrButton>
    </div>

    <KrSlider
      :model-value="props.section.offset.value"
      :min="props.section.range.value.min"
      :max="props.section.range.value.max"
      :step="props.section.step.value"
      label="Смещение плоскости сечения"
      data-testid="section-slider"
      @update:model-value="props.section.setOffset($event)"
    />

    <KrNumberInput
      :model-value="props.section.offset.value"
      :step="props.section.step.value"
      label="Смещение"
      suffix="мм"
      data-testid="section-offset"
      @update:model-value="props.section.setOffset($event)"
    />

    <div :class="$style.actions">
      <KrButton variant="secondary" size="sm" data-testid="section-flip" @click="props.section.flip()">
        Перевернуть
      </KrButton>
      <KrButton variant="secondary" size="sm" data-testid="section-look-at" @click="emit('look-at')">
        Вид по нормали
      </KrButton>
    </div>
  </div>
</template>

<style module>
.panel {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 14;
  width: 236px;
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-sm);
  padding: 10px 12px 12px;
  background: oklch(1 0 0 / 0.92);
  border: 1px solid var(--kr-border-strong);
  border-radius: 9px;
  box-shadow: var(--kr-shadow-sm);
  backdrop-filter: blur(6px);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: var(--kr-font-size-sm);
  font-weight: var(--kr-font-weight-bold);
  color: var(--kr-text);
}

.iconBtn.iconBtn {
  width: 26px;
  height: 26px;
  padding: 0;
  color: var(--kr-text-secondary);
}

.planes {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.planeBtn.planeBtn {
  padding: 0;
  height: 28px;
  font-family: var(--kr-font-mono);
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-secondary);
  border: 1px solid var(--kr-border);
}

.planeBtnActive.planeBtnActive,
.planeBtnActive.planeBtnActive:hover {
  background: var(--kr-primary);
  border-color: var(--kr-primary);
  color: var(--kr-primary-fg);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
</style>
