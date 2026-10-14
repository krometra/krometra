<script setup lang="ts">
import { computed } from "vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { useDocumentModel } from "@/composables/editor/useDocumentModel";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { ExtrudeRevolveApi } from "@/composables/editor/useExtrudeRevolve";

const props = defineProps<{ extrude: ExtrudeRevolveApi }>();

const {
  lastSavedSketchId,
  lastSavedSketchTargetId,
  panelMode,
  extrudeOperation,
  extrudeTargetBodyId,
  extrudePreviewError,
  extrudeDistance,
  extrudeDistanceExpr,
  extrudeDistanceInvalid,
  extrudeDirection,
  extrudeReversed,
  extrudeSignedDistance,
  extrudeError,
  extrudeLoading,
  revolveAngle,
  revolveAxis,
  revolveAxisOrigin,
  revolveDirection,
  revolveError,
  revolveLoading,
  onDistanceWheel,
  applyDistanceExpr,
  onDistanceInput,
  handleExtrude,
  handleRevolve,
  clearSketchContext,
} = props.extrude;
const { extentType, backDistance, offset, upToBodyId, upToFace } = props.extrude.extent;

const names = useDisplayNames();
const { bodies } = useDocumentModel();

// Итог операции виден прямо на кнопке: значение поля применяется на лету,
// но раньше это никак не подтверждалось — «Выдавить» молчало о числе.
const extrudeButtonLabel = computed(() => {
  if (extrudeLoading.value) return "Выдавливание…";
  const verb = extrudeOperation.value === "cut" ? "Вырезать" : "Выдавить";
  if (extentType.value === "through_all") return `${verb} насквозь`;
  if (extentType.value === "up_to_face") return `${verb} до грани`;
  if (extentType.value === "up_to_body") return `${verb} до тела`;
  return `${verb} ${Number(extrudeDistance.value.toFixed(3))} мм`;
});

const upToFaceLabel = computed(() => {
  if (!upToFace.value) return "Кликните грань во вьюпорте";
  return `${names.bodyLabel(upToFace.value.bodyId)} · грань ${upToFace.value.faceId}`;
});

const directionHint = computed(() =>
  extrudeSignedDistance.value < 0 ? "против нормали эскиза" : "по нормали эскиза",
);

function cancel() {
  clearSketchContext();
}
</script>

<template>
  <PropsPanelShell
    :title="panelMode === 'revolve' ? 'Вращать' : 'Выдавить'"
    :kind="panelMode === 'revolve' ? 'REVOLVE' : 'EXTRUDE'"
    dot-color="oklch(0.70 0.13 233)"
  >
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Эскиз</span>
      </div>
      <div :class="$style.fieldInput">
        <span :class="$style.fieldValue">{{ names.sketchLabel(lastSavedSketchId ?? '') }}</span>
      </div>
    </div>

    <template v-if="panelMode === 'extrude'">
    <div :class="$style.panelHead">ПАРАМЕТРЫ ВЫДАВЛИВАНИЯ</div>
    <div v-if="lastSavedSketchTargetId || bodies.length > 0" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Операция</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="extrudeOperation" :class="$style.selectInput">
          <option value="new_body">Новое тело</option>
          <option value="join">Приклеить</option>
          <option value="cut">Вырезать</option>
        </select>
      </div>
    </div>
    <div v-if="extrudeOperation !== 'new_body' && !lastSavedSketchTargetId" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Целевое тело</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="extrudeTargetBodyId" :class="$style.selectInput">
          <option v-for="b in bodies" :key="b.id" :value="b.id">{{ names.bodyLabel(b.id) }}</option>
        </select>
      </div>
    </div>
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Граница</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="extentType" :class="$style.selectInput" data-testid="extrude-extent">
          <option value="distance">На расстояние</option>
          <option value="through_all">Насквозь</option>
          <option value="up_to_face">До грани</option>
          <option value="up_to_body">До тела</option>
        </select>
      </div>
    </div>
    <div v-if="extentType === 'up_to_face'" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Грань</span>
      </div>
      <div :class="$style.fieldInput">
        <span :class="$style.fieldValue" data-testid="extrude-up-to-face">{{ upToFaceLabel }}</span>
      </div>
    </div>
    <div v-if="extentType === 'up_to_body'" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>До тела</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="upToBodyId" :class="$style.selectInput" data-testid="extrude-up-to-body">
          <option v-for="b in bodies" :key="b.id" :value="b.id">{{ names.bodyLabel(b.id) }}</option>
        </select>
      </div>
    </div>
    <div v-if="extentType === 'up_to_face' || extentType === 'up_to_body'" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Смещение</span>
        <span :class="$style.fieldExpr">мм</span>
      </div>
      <div :class="$style.fieldInput">
        <input
          v-model.number="offset"
          type="number"
          step="0.5"
          :class="$style.numberInput"
          title="Положительное — дальше цели, отрицательное — не доходя до неё"
          data-testid="extrude-offset"
        />
        <span :class="$style.fieldUnit">мм</span>
      </div>
    </div>
    <div v-if="extentType === 'distance'" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Расстояние</span>
        <span :class="$style.fieldExpr">мм</span>
      </div>
      <div :class="$style.fieldInput">
        <input
          v-model="extrudeDistanceExpr"
          type="text"
          inputmode="decimal"
          :class="[$style.numberInput, extrudeDistanceInvalid && $style.inputInvalid]"
          title="Только положительное. Колесо мыши: ±1 мм. Можно выражение: 30/2, width*2 (имена из Параметров)"
          @wheel.prevent="onDistanceWheel"
          @input="onDistanceInput"
          @change="applyDistanceExpr"
          @keyup.enter="applyDistanceExpr"
        />
        <span :class="$style.fieldUnit">мм</span>
      </div>
      <div v-if="extrudeDistanceInvalid" :class="$style.hint">
        Расстояние должно быть больше нуля — сторону задаёт «Реверс».
      </div>
    </div>
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Направление</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="extrudeDirection" :class="$style.selectInput">
          <option value="one_side">Одностороннее</option>
          <option value="symmetric">Симметричное</option>
          <option value="two_sided">В обе стороны</option>
        </select>
      </div>
    </div>
    <div v-if="extrudeDirection === 'two_sided'" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Обратное расстояние</span>
        <span :class="$style.fieldExpr">мм</span>
      </div>
      <div :class="$style.fieldInput">
        <input
          v-model.number="backDistance"
          type="number"
          min="0"
          step="1"
          :class="$style.numberInput"
          title="Длина против основного направления"
          data-testid="extrude-back-distance"
        />
        <span :class="$style.fieldUnit">мм</span>
      </div>
    </div>
    <div :class="$style.field">
      <label :class="$style.toggleRow">
        <input v-model="extrudeReversed" type="checkbox" data-testid="extrude-reverse" />
        <span>Реверс</span>
        <span :class="$style.toggleHint">{{ directionHint }}</span>
      </label>
    </div>
    <div v-if="extrudeError || extrudePreviewError" :class="$style.conflictWarning" data-testid="extrude-error">
      {{ extrudeError ?? extrudePreviewError }}
    </div>
    <div :class="$style.field" style="margin-top:16px">
      <button
        :class="$style.extrudeBtn"
        :disabled="extrudeLoading || extrudeDistanceInvalid"
        data-testid="extrude-apply"
        @click="handleExtrude"
      >
        {{ extrudeButtonLabel }}
      </button>
    </div>
    </template>

    <template v-else>
    <div :class="$style.panelHead">ПАРАМЕТРЫ ВРАЩЕНИЯ</div>
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Угол</span>
        <span :class="$style.fieldExpr">°</span>
      </div>
      <div :class="$style.fieldInput">
        <input
          v-model.number="revolveAngle"
          type="number"
          min="0.1"
          max="360"
          step="1"
          :class="$style.numberInput"
        />
        <span :class="$style.fieldUnit">°</span>
      </div>
    </div>
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Ось вращения</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="revolveAxis" :class="$style.selectInput">
          <option value="y">Y (вертик.)</option>
          <option value="x">X (гориз.)</option>
        </select>
      </div>
    </div>
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Начало оси (X)</span>
      </div>
      <div :class="$style.fieldInput">
        <input
          v-model.number="revolveAxisOrigin.x"
          type="number"
          step="1"
          :class="$style.numberInput"
        />
      </div>
    </div>
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Начало оси (Y)</span>
      </div>
      <div :class="$style.fieldInput">
        <input
          v-model.number="revolveAxisOrigin.y"
          type="number"
          step="1"
          :class="$style.numberInput"
        />
      </div>
    </div>
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>Направление</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="revolveDirection" :class="$style.selectInput">
          <option value="one_side">Одностороннее</option>
          <option value="symmetric">Симметричное</option>
        </select>
      </div>
    </div>
    <div v-if="revolveError" :class="$style.conflictWarning">
      {{ revolveError }}
    </div>
    <div :class="$style.field" style="margin-top:16px">
      <button
        :class="[$style.extrudeBtn, $style.revolveBtn]"
        :disabled="revolveLoading"
        data-testid="revolve-apply"
        @click="handleRevolve"
      >
        {{ revolveLoading ? 'Вращение…' : 'Вращать' }}
      </button>
    </div>
    </template>
    <template #foot>
      <button :class="$style.cancelBtn" @click="cancel">Отмена (Esc)</button>
    </template>
  </PropsPanelShell>
</template>

<style module>
.panelHead {
  font-family: var(--cs-font-mono);
  font-size: 11px;
  color: var(--cs-text-secondary);
  letter-spacing: 0.04em;
  margin-bottom: 13px;
}

.field {
  margin-bottom: 13px;
}

.fieldLabel {
  font-size: 12px;
  color: var(--cs-text-secondary);
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
}

.fieldExpr {
  font-family: var(--cs-font-mono);
  color: var(--cs-text-muted);
}

.fieldInput {
  display: flex;
  align-items: center;
  background: var(--cs-surface-sunken);
  border: 1px solid var(--cs-border-strong);
  border-radius: 7px;
  padding: 9px 12px;
  transition: border-color var(--cs-transition-fast);
}

.fieldInput:hover {
  border-color: var(--cs-primary-border);
}

.fieldValue {
  font-family: var(--cs-font-mono);
  font-size: 14px;
  font-weight: var(--cs-font-weight-medium);
  color: var(--cs-text);
}

.fieldUnit {
  margin-left: auto;
  font-family: var(--cs-font-mono);
  font-size: 12px;
  color: var(--cs-amber-strong);
}

.numberInput {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--cs-font-mono);
  font-size: 14px;
  font-weight: var(--cs-font-weight-medium);
  color: var(--cs-text);
  -moz-appearance: textfield;
}

.numberInput::-webkit-outer-spin-button,
.numberInput::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.selectInput {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--cs-font-mono);
  font-size: 13px;
  color: var(--cs-text);
  cursor: pointer;
}

.hint {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--cs-red-strong);
}

.toggleRow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--cs-text-secondary);
  cursor: pointer;
}

.toggleHint {
  margin-left: auto;
  font-family: var(--cs-font-mono);
  font-size: 11px;
  color: var(--cs-text-muted);
}

.inputInvalid {
  border-color: var(--cs-error) !important;
  color: var(--cs-red-strong);
}

.conflictWarning {
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: 7px;
  background: oklch(0.96 0.025 25);
  border: 1px solid oklch(0.65 0.16 25 / 0.5);
  color: var(--cs-red-strong);
  font-size: 12px;
  line-height: 1.5;
}

.extrudeBtn {
  width: 100%;
  cursor: pointer;
  background: var(--cs-primary);
  color: var(--cs-primary-fg);
  font-weight: var(--cs-font-weight-bold);
  font-size: 14px;
  padding: 10px;
  border: none;
  border-radius: 7px;
  transition: background var(--cs-transition-fast), opacity var(--cs-transition-fast);
}

.extrudeBtn:hover:not(:disabled) {
  background: var(--cs-primary-hover);
}

.extrudeBtn:disabled {
  background: var(--cs-surface-sunken);
  color: var(--cs-text-disabled);
  cursor: not-allowed;
}

.revolveBtn {
  background: oklch(0.68 0.16 180);
}

.revolveBtn:hover:not(:disabled) {
  background: oklch(0.62 0.18 180);
}

.cancelBtn {
  flex: 1;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--cs-border-strong);
  font-size: 13px;
  padding: 9px;
  border-radius: 7px;
  color: var(--cs-text);
  transition: border-color var(--cs-transition-fast);
}

.cancelBtn:hover {
  border-color: var(--cs-text-muted);
}
</style>
