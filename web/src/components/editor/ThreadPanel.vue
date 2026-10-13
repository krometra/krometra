<script setup lang="ts">
import { computed, ref, watch } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsNumberInput from "@/components/ui/CsNumberInput.vue";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { ThreadApi } from "@/composables/editor/useThread";

const props = defineProps<{ thread: ThreadApi }>();

/**
 * Готовые профили. Метрическая — острый треугольник; чем шире вершина клина
 * (crestRatio) и крупнее шаг, тем ближе к «банке»: широкий пологий паз,
 * который наворачивается за пол-оборота благодаря нескольким заходам.
 */
interface Preset {
  id: string;
  label: string;
  hint: string;
  pitch: number;
  /** Глубина профиля, % шага. */
  depthPercent: number;
  /** Ширина плоской вершины клина, % шага. */
  crestPercent: number;
  starts: number;
}

const PRESETS: Preset[] = [
  { id: "m-fine", label: "Метрическая мелкая", hint: "шаг 1 мм, острый профиль", pitch: 1, depthPercent: 61, crestPercent: 0, starts: 1 },
  { id: "m-std", label: "Метрическая", hint: "шаг 1.5 мм, острый профиль", pitch: 1.5, depthPercent: 61, crestPercent: 0, starts: 1 },
  { id: "trapez", label: "Трапецеидальная", hint: "шаг 4 мм, плоская вершина", pitch: 4, depthPercent: 50, crestPercent: 35, starts: 1 },
  { id: "jar", label: "Банка", hint: "шаг 6 мм, широкий паз, 2 захода", pitch: 6, depthPercent: 30, crestPercent: 55, starts: 2 },
  { id: "cap", label: "Крышка", hint: "шаг 9 мм, очень крупная, 3 захода", pitch: 9, depthPercent: 25, crestPercent: 60, starts: 3 },
];

const pitch = ref(1.5);
// Глубину и профиль держим в процентах от шага: у крупной резьбы абсолютная
// глубина растёт вместе с шагом, иначе паз банки выходит царапиной.
// Проценты — целые числа: поле числового ввода теряет дробные (0.4 → 4).
const depthPercent = ref(61);
const crestPercent = ref(0);
const starts = ref(1);
const rightHanded = ref(true);
// 0 = резьба на всю цилиндрическую грань
const length = ref(0);
const offset = ref(0);

const activePreset = ref<string | null>("m-std");

const depthMm = computed(() => (pitch.value * depthPercent.value) / 100);
const leadMm = computed(() => pitch.value * starts.value);

const hasFace = computed(() => props.thread.bodyId.value !== null);
const hasCylinder = computed(() => props.thread.cylinder.value !== null);

const statusText = computed(() => {
  if (props.thread.faceHint.value) return props.thread.faceHint.value;
  if (!hasFace.value) {
    return "Кликните цилиндрическую грань: стержень — внешняя резьба, отверстие — внутренняя";
  }
  const cylinder = props.thread.cylinder.value;
  if (!cylinder) return "Разбираю грань…";
  const kind = cylinder.external ? "внешняя" : "внутренняя";
  return `Грань ⌀${(cylinder.radius * 2).toFixed(1)} мм, ${kind} резьба — призрак показывает будущие витки`;
});

/**
 * Призрак строится по тем же числам, что уйдут на сервер, поэтому параметры
 * отдаём одним watch: любая правка поля сразу перерисовывает витки.
 */
watch(
  [pitch, depthMm, length, offset, starts, rightHanded, crestPercent, hasCylinder],
  () => {
    props.thread.updatePreview({
      pitch: pitch.value,
      depth: depthMm.value,
      length: length.value > 0 ? length.value : null,
      offset: offset.value,
      starts: starts.value,
      rightHanded: rightHanded.value,
      crestRatio: crestPercent.value / 100,
    });
  },
  { immediate: true },
);

/** Словесная характеристика профиля — понятнее, чем доля шага. */
const profileLabel = computed(() => {
  if (crestPercent.value < 5) return "острый треугольник";
  if (crestPercent.value < 30) return "притуплённый";
  if (crestPercent.value < 50) return "трапеция";
  return "широкий паз";
});

function applyPreset(preset: Preset) {
  activePreset.value = preset.id;
  pitch.value = preset.pitch;
  depthPercent.value = preset.depthPercent;
  crestPercent.value = preset.crestPercent;
  starts.value = preset.starts;
}

/** Ручная правка снимает отметку с пресета: цифры больше не его. */
function markCustom() {
  activePreset.value = null;
}

function handleApply() {
  if (!hasCylinder.value || props.thread.loading.value) return;
  props.thread.apply({
    pitch: pitch.value,
    depth: depthMm.value,
    length: length.value > 0 ? length.value : null,
    offset: offset.value,
    crestRatio: crestPercent.value / 100,
    starts: starts.value,
    rightHanded: rightHanded.value,
  });
}
</script>

<template>
  <PropsPanelShell title="Резьба" kind="FEATURE" dot-color="oklch(0.72 0.14 60)">
    <div :class="$style.body" data-testid="thread-panel">
      <p :class="[$style.status, hasCylinder && $style.statusReady]" data-testid="thread-status">
        {{ statusText }}
      </p>

      <div :class="$style.presets">
        <CsButton
          v-for="preset in PRESETS"
          :key="preset.id"
          size="sm"
          :variant="activePreset === preset.id ? 'primary' : 'secondary'"
          :class="$style.preset"
          :title="preset.hint"
          :data-testid="`thread-preset-${preset.id}`"
          @click="applyPreset(preset)"
        >
          {{ preset.label }}
        </CsButton>
      </div>

      <div :class="$style.field">
        <span :class="$style.label">Шаг</span>
        <CsNumberInput
          v-model="pitch"
          :min="0.2"
          :max="30"
          :step="0.5"
          suffix="мм"
          data-testid="thread-pitch"
          @update:model-value="markCustom"
        />
      </div>

      <div :class="$style.field">
        <span :class="$style.label">Глубина профиля</span>
        <CsNumberInput
          v-model="depthPercent"
          :min="5"
          :max="90"
          :step="5"
          suffix="% шага"
          data-testid="thread-depth-ratio"
          @update:model-value="markCustom"
        />
        <span :class="$style.hint">{{ depthMm.toFixed(2) }} мм при текущем шаге</span>
      </div>

      <div :class="$style.field">
        <span :class="$style.label">Профиль</span>
        <CsNumberInput
          v-model="crestPercent"
          :min="0"
          :max="90"
          :step="5"
          suffix="% шага"
          data-testid="thread-crest"
          @update:model-value="markCustom"
        />
        <span :class="$style.hint">Вершина клина: {{ profileLabel }}</span>
      </div>

      <div :class="$style.field">
        <span :class="$style.label">Заходы</span>
        <CsNumberInput
          v-model="starts"
          :min="1"
          :max="8"
          :step="1"
          data-testid="thread-starts"
          @update:model-value="markCustom"
        />
        <span :class="$style.hint">Подъём за оборот {{ leadMm.toFixed(1) }} мм</span>
      </div>

      <div :class="$style.field">
        <span :class="$style.label">Длина</span>
        <CsNumberInput
          v-model="length"
          :min="0"
          :step="1"
          suffix="мм"
          data-testid="thread-length"
        />
        <span :class="$style.hint">0 — на всю грань</span>
      </div>

      <div :class="$style.field">
        <span :class="$style.label">Отступ</span>
        <CsNumberInput
          v-model="offset"
          :min="0"
          :step="1"
          suffix="мм"
          data-testid="thread-offset"
        />
      </div>

      <div :class="$style.handed">
        <CsButton
          size="sm"
          :variant="rightHanded ? 'primary' : 'secondary'"
          data-testid="thread-right"
          @click="rightHanded = true"
        >
          Правая
        </CsButton>
        <CsButton
          size="sm"
          :variant="!rightHanded ? 'primary' : 'secondary'"
          data-testid="thread-left"
          @click="rightHanded = false"
        >
          Левая
        </CsButton>
      </div>

      <p v-if="thread.error.value" :class="$style.error" data-testid="thread-error">
        {{ thread.error.value }}
      </p>
    </div>

    <template #foot>
      <CsButton
        variant="primary"
        :disabled="!hasCylinder || thread.loading.value"
        data-testid="thread-apply"
        @click="handleApply"
      >
        {{ thread.loading.value ? "Строю…" : "Применить" }}
      </CsButton>
      <CsButton variant="ghost" @click="thread.exit">Закрыть</CsButton>
    </template>
  </PropsPanelShell>
</template>

<style module>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--cs-spacing-md);
  padding: var(--cs-spacing-md);
}

.status {
  margin: 0;
  font-size: var(--cs-font-size-xs);
  line-height: 1.45;
  color: var(--cs-text-muted);
}

.statusReady {
  color: var(--cs-text-secondary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
}

.hint {
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-muted);
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.preset {
  padding: 3px 8px;
}

.handed {
  display: flex;
  gap: 4px;
}

.error {
  margin: 0;
  font-size: var(--cs-font-size-xs);
  line-height: 1.45;
  color: var(--cs-danger);
}
</style>
