<script setup lang="ts">
import { computed } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsIcon from "@/components/ui/CsIcon.vue";
import CsNumberInput from "@/components/ui/CsNumberInput.vue";
import CsSelect from "@/components/ui/CsSelect.vue";
import type { MeasureApi } from "@/composables/editor/useMeasure";
import { MATERIALS } from "@/lib/measureFormat";
import PropsPanelShell from "./PropsPanelShell.vue";

const props = defineProps<{ measure: MeasureApi }>();

const { filter, picks, pickLabels, groups, loading, error, materialId, density, measuresBody, customMaterialId } = props.measure;

const materialOptions = [
  ...MATERIALS.map((material) => ({ value: material.id, label: `${material.label} — ${material.density} г/см³` })),
  { value: customMaterialId, label: "Своя плотность" },
];

const hint = computed(() => {
  if (picks.value.length === 0) {
    return filter.value === "body"
      ? "Кликните тело — объём, площадь, центр масс, габарит и масса. Второе тело — расстояние между ними."
      : "Кликните вершину, ребро или грань. Второй объект — расстояние и угол между ними.";
  }
  return picks.value.length === 1 ? "Кликните второй объект, чтобы измерить расстояние между ними." : null;
});
</script>

<template>
  <PropsPanelShell title="Измерить" kind="INSPECT" dot-color="var(--cs-teal-strong)">
    <div :class="$style.body" data-testid="measure-panel">
      <div :class="$style.filter">
        <CsButton
          size="sm"
          :variant="filter === 'entity' ? 'primary' : 'secondary'"
          data-testid="measure-filter-entity"
          @click="props.measure.setFilter('entity')"
        >
          Элементы
        </CsButton>
        <CsButton
          size="sm"
          :variant="filter === 'body' ? 'primary' : 'secondary'"
          data-testid="measure-filter-body"
          @click="props.measure.setFilter('body')"
        >
          Тела
        </CsButton>
      </div>

      <p v-if="hint" :class="$style.hint" data-testid="measure-hint">{{ hint }}</p>

      <ul v-if="picks.length > 0" :class="$style.picks">
        <li v-for="(label, index) in pickLabels" :key="index" :class="$style.pick" data-testid="measure-pick">
          <span :class="[$style.swatch, index === 0 ? $style.first : $style.second]" />
          <span :class="$style.pickLabel">{{ label }}</span>
          <CsButton
            variant="ghost"
            size="sm"
            :aria-label="`Убрать из измерения: ${label}`"
            data-testid="measure-pick-remove"
            @click="props.measure.removePick(index)"
          >
            <CsIcon name="close" :size="12" />
          </CsButton>
        </li>
      </ul>

      <p v-if="loading" :class="$style.hint">Измеряю…</p>
      <p v-if="error" :class="$style.error" data-testid="measure-error">{{ error }}</p>

      <section v-for="group in groups" :key="group.id" :class="$style.group" :data-testid="`measure-group-${group.id}`">
        <h4 :class="$style.groupTitle">{{ group.title }}</h4>
        <div v-for="row in group.rows" :key="row.id" :class="$style.row" :data-testid="`measure-row-${row.id}`">
          <span :class="$style.label">{{ row.label }}</span>
          <span :class="$style.value">{{ row.value }}</span>
          <CsButton
            variant="ghost"
            size="sm"
            :aria-label="`Копировать: ${row.label}`"
            :title="`Копировать ${row.copy}`"
            data-testid="measure-copy"
            @click="props.measure.copy(row)"
          >
            <CsIcon name="copy" :size="12" />
          </CsButton>
        </div>
      </section>

      <div v-if="measuresBody" :class="$style.material">
        <CsSelect
          label="Материал"
          :model-value="materialId"
          :options="materialOptions"
          data-testid="measure-material"
          @update:model-value="props.measure.setMaterial"
        />
        <CsNumberInput
          label="Плотность"
          :model-value="density"
          :min="0.01"
          :max="25"
          :step="0.01"
          suffix="г/см³"
          data-testid="measure-density"
          @update:model-value="props.measure.setDensity"
        />
      </div>
    </div>

    <template #foot>
      <CsButton variant="secondary" size="sm" data-testid="measure-close" @click="props.measure.exit()">
        Закрыть (Esc)
      </CsButton>
    </template>
  </PropsPanelShell>
</template>

<style module>
.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter {
  display: flex;
  gap: 6px;
}

.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cs-text-secondary);
}

.error {
  margin: 0;
  font-size: 12px;
  color: var(--cs-error);
}

.picks {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pick {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.swatch {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 2px;
}

.first {
  background: var(--cs-amber-strong);
}

.second {
  background: var(--cs-green-strong);
}

.pickLabel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 8px;
  border-top: 1px solid var(--cs-border-subtle);
}

.groupTitle {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: var(--cs-font-weight-bold);
  color: var(--cs-text-muted);
}

.row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.label {
  color: var(--cs-text-secondary);
}

.value {
  font-family: var(--cs-font-mono);
  color: var(--cs-text);
  text-align: right;
}

.material {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--cs-border-subtle);
}
</style>
