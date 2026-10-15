<script setup lang="ts">
import CsButton from "@/components/ui/CsButton.vue";
import CsIcon from "@/components/ui/CsIcon.vue";
import CsNumberInput from "@/components/ui/CsNumberInput.vue";
import CsSlider from "@/components/ui/CsSlider.vue";
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
      <CsButton
        variant="ghost"
        size="sm"
        :class="$style.iconBtn"
        title="Выключить сечение (Esc)"
        aria-label="Выключить сечение"
        data-testid="section-close"
        @click="props.section.close()"
      >
        <CsIcon name="close" :size="15" />
      </CsButton>
    </div>

    <div :class="$style.planes">
      <CsButton
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
      </CsButton>
      <CsButton
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
      </CsButton>
    </div>

    <CsSlider
      :model-value="props.section.offset.value"
      :min="props.section.range.value.min"
      :max="props.section.range.value.max"
      :step="props.section.step.value"
      label="Смещение плоскости сечения"
      data-testid="section-slider"
      @update:model-value="props.section.setOffset($event)"
    />

    <CsNumberInput
      :model-value="props.section.offset.value"
      :step="props.section.step.value"
      label="Смещение"
      suffix="мм"
      data-testid="section-offset"
      @update:model-value="props.section.setOffset($event)"
    />

    <div :class="$style.actions">
      <CsButton variant="secondary" size="sm" data-testid="section-flip" @click="props.section.flip()">
        Перевернуть
      </CsButton>
      <CsButton variant="secondary" size="sm" data-testid="section-look-at" @click="emit('look-at')">
        Вид по нормали
      </CsButton>
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
  gap: var(--cs-spacing-sm);
  padding: 10px 12px 12px;
  background: oklch(1 0 0 / 0.92);
  border: 1px solid var(--cs-border-strong);
  border-radius: 9px;
  box-shadow: var(--cs-shadow-sm);
  backdrop-filter: blur(6px);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: var(--cs-font-size-sm);
  font-weight: var(--cs-font-weight-bold);
  color: var(--cs-text);
}

.iconBtn.iconBtn {
  width: 26px;
  height: 26px;
  padding: 0;
  color: var(--cs-text-secondary);
}

.planes {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.planeBtn.planeBtn {
  padding: 0;
  height: 28px;
  font-family: var(--cs-font-mono);
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
  border: 1px solid var(--cs-border);
}

.planeBtnActive.planeBtnActive,
.planeBtnActive.planeBtnActive:hover {
  background: var(--cs-primary);
  border-color: var(--cs-primary);
  color: var(--cs-primary-fg);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
</style>
