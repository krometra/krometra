<script setup lang="ts">
import { computed } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsNumberInput from "@/components/ui/CsNumberInput.vue";
import CsSelect from "@/components/ui/CsSelect.vue";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { HoleApi } from "@/composables/editor/useHole";
import { HOLE_BOTTOM_LABELS, HOLE_EXTENT_LABELS, HOLE_TYPE_LABELS } from "@/lib/holeFeature";
import { HOLE_BOTTOMS, HOLE_EXTENTS, HOLE_TYPES, type HoleSpec } from "@/lib/holeGeometry";
import { pluralize } from "@/lib/plural";

const props = defineProps<{ hole: HoleApi }>();

const CLICKS = "clicks";

const spec = computed(() => props.hole.spec.value);
const count = computed(() => props.hole.centers.value.length);
const fromSketch = computed(() => props.hole.sketchId.value !== null);
const ready = computed(() => count.value > 0 && !props.hole.specError.value && !props.hole.loading.value);

const sourceOptions = computed(() => [
  { label: "Клики по грани", value: CLICKS },
  ...props.hole.sketchOptions.value.map((sketch) => ({ label: `Окружности: ${sketch.label}`, value: sketch.id })),
]);

const statusText = computed(() => {
  if (props.hole.faceHint.value) return props.hole.faceHint.value;
  if (props.hole.bodyId.value === null) {
    return fromSketch.value
      ? "Кликните плоскую грань тела — отверстия встанут в центры окружностей эскиза"
      : "Кликните плоскую грань тела — каждый клик ставит центр отверстия";
  }
  if (count.value === 0) return fromSketch.value ? "В эскизе нет окружностей для центров" : "Кликайте по грани, чтобы поставить центры";
  return `${pluralize(count.value, "отверстие", "отверстия", "отверстий")} — призрак показывает вырез`;
});

function update<K extends keyof HoleSpec>(key: K, value: HoleSpec[K]) {
  props.hole.updateSpec({ [key]: value } as Partial<HoleSpec>);
}

function setSource(value: string) {
  props.hole.setSketch(value === CLICKS ? null : value);
}

function coordinates(point: number[]) {
  return point.map((value) => value.toFixed(1)).join(", ");
}
</script>

<template>
  <PropsPanelShell title="Отверстие" kind="FEATURE" dot-color="oklch(0.72 0.14 60)">
    <div :class="$style.body" data-testid="hole-panel">
      <p :class="[$style.status, count > 0 && $style.statusReady]" data-testid="hole-status">{{ statusText }}</p>

      <div :class="$style.toggles">
        <CsButton
          v-for="type in HOLE_TYPES"
          :key="type"
          size="sm"
          :variant="spec.type === type ? 'primary' : 'secondary'"
          :data-testid="`hole-type-${type}`"
          @click="update('type', type)"
        >
          {{ HOLE_TYPE_LABELS[type] }}
        </CsButton>
      </div>

      <CsSelect
        label="Центры"
        :model-value="hole.sketchId.value ?? CLICKS"
        :options="sourceOptions"
        data-testid="hole-source"
        @update:model-value="setSource"
      />

      <div v-if="!fromSketch && hole.clickedCenters.value.length > 0" :class="$style.centers" data-testid="hole-centers">
        <div v-for="(point, index) in hole.clickedCenters.value" :key="index" :class="$style.center">
          <span>{{ index + 1 }}. ({{ coordinates(point) }})</span>
          <CsButton size="sm" variant="ghost" :data-testid="`hole-center-remove-${index}`" @click="hole.removeCenter(index)">Убрать</CsButton>
        </div>
        <CsButton size="sm" variant="ghost" data-testid="hole-centers-clear" @click="hole.clearCenters">Очистить центры</CsButton>
      </div>

      <CsNumberInput
        label="Диаметр"
        :model-value="spec.diameter"
        :min="0.1"
        :step="0.5"
        suffix="мм"
        data-testid="hole-diameter"
        @update:model-value="update('diameter', $event)"
      />

      <div :class="$style.toggles">
        <CsButton
          v-for="extent in HOLE_EXTENTS"
          :key="extent"
          size="sm"
          :variant="spec.extent === extent ? 'primary' : 'secondary'"
          :data-testid="`hole-extent-${extent}`"
          @click="update('extent', extent)"
        >
          {{ HOLE_EXTENT_LABELS[extent] }}
        </CsButton>
      </div>

      <template v-if="spec.extent === 'distance'">
        <CsNumberInput
          label="Глубина"
          :model-value="spec.depth"
          :min="0.1"
          :step="1"
          suffix="мм"
          data-testid="hole-depth"
          @update:model-value="update('depth', $event)"
        />
        <div :class="$style.toggles">
          <CsButton
            v-for="bottom in HOLE_BOTTOMS"
            :key="bottom"
            size="sm"
            :variant="spec.bottom === bottom ? 'primary' : 'secondary'"
            :data-testid="`hole-bottom-${bottom}`"
            @click="update('bottom', bottom)"
          >
            {{ HOLE_BOTTOM_LABELS[bottom] }}
          </CsButton>
        </div>
      </template>

      <template v-if="spec.type === 'counterbore'">
        <CsNumberInput
          label="Диаметр цековки"
          :model-value="spec.cboreDiameter"
          :min="0.1"
          :step="0.5"
          suffix="мм"
          data-testid="hole-cbore-diameter"
          @update:model-value="update('cboreDiameter', $event)"
        />
        <CsNumberInput
          label="Глубина цековки"
          :model-value="spec.cboreDepth"
          :min="0.1"
          :step="0.5"
          suffix="мм"
          data-testid="hole-cbore-depth"
          @update:model-value="update('cboreDepth', $event)"
        />
      </template>

      <template v-if="spec.type === 'countersink'">
        <CsNumberInput
          label="Диаметр зенковки"
          :model-value="spec.csinkDiameter"
          :min="0.1"
          :step="0.5"
          suffix="мм"
          data-testid="hole-csink-diameter"
          @update:model-value="update('csinkDiameter', $event)"
        />
        <CsNumberInput
          label="Угол зенковки"
          :model-value="spec.csinkAngle"
          :min="1"
          :max="179"
          :step="1"
          suffix="°"
          data-testid="hole-csink-angle"
          @update:model-value="update('csinkAngle', $event)"
        />
      </template>

      <p v-if="hole.specError.value" :class="$style.error" data-testid="hole-spec-error">{{ hole.specError.value }}</p>
      <p v-if="hole.error.value" :class="$style.error" data-testid="hole-error">{{ hole.error.value }}</p>
    </div>

    <template #foot>
      <CsButton variant="primary" :disabled="!ready" data-testid="hole-apply" @click="hole.apply">
        {{ hole.loading.value ? "Сверлю…" : "Применить" }}
      </CsButton>
      <CsButton variant="ghost" @click="hole.exit">Закрыть</CsButton>
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

.toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.centers {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: var(--cs-font-mono);
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
}

.center {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cs-spacing-sm);
}

.error {
  margin: 0;
  font-size: var(--cs-font-size-xs);
  line-height: 1.45;
  color: var(--cs-danger);
}
</style>
