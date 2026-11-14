<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
const { t } = useI18n();
import { computed } from "vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { useDocumentModel } from "@/composables/editor/useDocumentModel";
import BodyPickList from "./BodyPickList.vue";
import PropsPanelShell from "./PropsPanelShell.vue";
import ProfileRegionsField from "./ProfileRegionsField.vue";
import type { ExtrudeRevolveApi } from "@/composables/editor/useExtrudeRevolve";

const props = defineProps<{ extrude: ExtrudeRevolveApi }>();

const {
  lastSavedSketchId,
  lastSavedSketchTargetId,
  panelMode,
  extrudeOperation,
  extrudeTargetBodyId,
  cutTargets,
  extrudePreviewError,
  extrudeDistance,
  distanceField,
  extrudeDirection,
  extrudeReversed,
  extrudeSignedDistance,
  extrudeError,
  extrudeLoading,
  revolveAngleField,
  revolveAxis,
  revolveAxisOrigin,
  revolveDirection,
  revolveError,
  revolveLoading,
  onDistanceWheel,
  handleExtrude,
  handleRevolve,
  clearSketchContext,
} = props.extrude;
const { text: extrudeDistanceExpr, error: extrudeDistanceError } = distanceField;
const { text: revolveAngleExpr, error: revolveAngleError } = revolveAngleField;
const { extentType, backDistance, offset, upToBodyId, upToFace } = props.extrude.extent;

const names = useDisplayNames();
const { bodies } = useDocumentModel();

// Итог операции виден прямо на кнопке: значение поля применяется на лету,
// но раньше это никак не подтверждалось — «Выдавить» молчало о числе.
const extrudeButtonLabel = computed(() => {
  if (extrudeLoading.value) return t("editorPanels.extruding");
  const verb = extrudeOperation.value === "cut" ? t("editorPanels.cut") : t("editorPanels.extrude");
  if (extentType.value === "through_all") return t("editorPanels.action_through", { verb });
  if (extentType.value === "up_to_face") return t("editorPanels.action_face", { verb });
  if (extentType.value === "up_to_body") return t("editorPanels.action_body", { verb });
  return t("editorPanels.action_distance", { verb, distance: Number(extrudeDistance.value.toFixed(3)) });
});

const upToFaceLabel = computed(() => {
  if (!upToFace.value) return t("editorPanels.click_face_viewport");
  return t("editorPanels.face_of_body", { body: names.bodyLabel(upToFace.value.bodyId), face: upToFace.value.faceId });
});

const directionHint = computed(() =>
  extrudeSignedDistance.value < 0 ? t("editorPanels.against_normal") : t("editorPanels.along_normal"),
);

function cancel() {
  clearSketchContext();
}
</script>

<template>
  <PropsPanelShell
    :title="panelMode === 'revolve' ? t('editorPanels.revolve') : t('editorPanels.extrude')"
    :kind="panelMode === 'revolve' ? 'REVOLVE' : 'EXTRUDE'"
    dot-color="oklch(0.70 0.13 233)"
  >
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.sketch") }}</span>
      </div>
      <div :class="$style.fieldInput">
        <span :class="$style.fieldValue">{{ names.sketchLabel(lastSavedSketchId ?? '') }}</span>
      </div>
    </div>
    <ProfileRegionsField :profile="extrude.profile" />

    <template v-if="panelMode === 'extrude'">
    <div :class="$style.panelHead">{{ t("editorPanels.extrude_parameters") }}</div>
    <div v-if="lastSavedSketchTargetId || bodies.length > 0" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.operation") }}</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="extrudeOperation" :class="$style.selectInput">
          <option value="new_body">{{ t("editorPanels.new_body") }}</option>
          <option value="join">{{ t("editorPanels.join") }}</option>
          <option value="cut">{{ t("editorPanels.cut") }}</option>
        </select>
      </div>
    </div>
    <div v-if="extrudeOperation === 'cut'" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.cut_target_count", { count: cutTargets.targetIds.value.length }) }}</span>
      </div>
      <BodyPickList
        :body-ids="cutTargets.targetIds.value"
        :empty="t('editorPanels.select_scene_bodies')"
        test-id="extrude-cut-targets"
        @remove="cutTargets.remove"
      />
      <div :class="$style.note">{{ t("editorPanels.cut_targets_hint") }}</div>
    </div>
    <div v-if="extrudeOperation === 'join' && !lastSavedSketchTargetId" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.target_body") }}</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="extrudeTargetBodyId" :class="$style.selectInput">
          <option v-for="b in bodies" :key="b.id" :value="b.id">{{ names.bodyLabel(b.id) }}</option>
        </select>
      </div>
    </div>
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.extent") }}</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="extentType" :class="$style.selectInput" data-testid="extrude-extent">
          <option value="distance">{{ t("editorPanels.distance_extent") }}</option>
          <option value="through_all">{{ t("editorPanels.through_all") }}</option>
          <option value="up_to_face">{{ t("editorPanels.up_to_face") }}</option>
          <option value="up_to_body">{{ t("editorPanels.up_to_body") }}</option>
        </select>
      </div>
    </div>
    <div v-if="extentType === 'up_to_face'" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.face") }}</span>
      </div>
      <div :class="$style.fieldInput">
        <span :class="$style.fieldValue" data-testid="extrude-up-to-face">{{ upToFaceLabel }}</span>
      </div>
    </div>
    <div v-if="extentType === 'up_to_body'" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.up_to_body") }}</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="upToBodyId" :class="$style.selectInput" data-testid="extrude-up-to-body">
          <option v-for="b in bodies" :key="b.id" :value="b.id">{{ names.bodyLabel(b.id) }}</option>
        </select>
      </div>
    </div>
    <div v-if="extentType === 'up_to_face' || extentType === 'up_to_body'" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.offset") }}</span>
        <span :class="$style.fieldExpr">{{ t("editorPanels.mm") }}</span>
      </div>
      <div :class="$style.fieldInput">
        <input
          v-model.number="offset"
          type="number"
          step="0.5"
          :class="$style.numberInput"
          :title="t('editorPanels.positive_beyond')"
          data-testid="extrude-offset"
        />
        <span :class="$style.fieldUnit">{{ t("editorPanels.mm") }}</span>
      </div>
    </div>
    <div v-if="extentType === 'distance'" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.distance") }}</span>
        <span :class="$style.fieldExpr">{{ t("editorPanels.mm") }}</span>
      </div>
      <div :class="$style.fieldInput">
        <input
          v-model="extrudeDistanceExpr"
          type="text"
          inputmode="decimal"
          :class="[$style.numberInput, extrudeDistanceError && $style.inputInvalid]"
          :title="t('editorPanels.distance_input_hint')"
          data-testid="extrude-distance"
          @wheel.prevent="onDistanceWheel"
          @input="distanceField.onInput"
          @change="distanceField.commit"
          @keyup.enter="distanceField.commit"
        />
        <span :class="$style.fieldUnit">{{ t("editorPanels.mm") }}</span>
      </div>
      <div v-if="extrudeDistanceError" :class="$style.hint" data-testid="extrude-distance-error">
        {{ extrudeDistanceError }}
      </div>
    </div>
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.direction") }}</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="extrudeDirection" :class="$style.selectInput">
          <option value="one_side">{{ t("editorPanels.one_side") }}</option>
          <option value="symmetric">{{ t("editorPanels.symmetric") }}</option>
          <option value="two_sided">{{ t("editorPanels.two_sided") }}</option>
        </select>
      </div>
    </div>
    <div v-if="extrudeDirection === 'two_sided'" :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.back_distance") }}</span>
        <span :class="$style.fieldExpr">{{ t("editorPanels.mm") }}</span>
      </div>
      <div :class="$style.fieldInput">
        <input
          v-model.number="backDistance"
          type="number"
          min="0"
          step="1"
          :class="$style.numberInput"
          :title="t('editorPanels.back_distance_hint')"
          data-testid="extrude-back-distance"
        />
        <span :class="$style.fieldUnit">{{ t("editorPanels.mm") }}</span>
      </div>
    </div>
    <div :class="$style.field">
      <label :class="$style.toggleRow">
        <input v-model="extrudeReversed" type="checkbox" data-testid="extrude-reverse" />
        <span>{{ t("editorPanels.reverse") }}</span>
        <span :class="$style.toggleHint">{{ directionHint }}</span>
      </label>
    </div>
    <div v-if="extrudeError || extrudePreviewError" :class="$style.conflictWarning" data-testid="extrude-error">
      {{ extrudeError ?? extrudePreviewError }}
    </div>
    <div :class="$style.field" style="margin-top:16px">
      <button
        :class="$style.extrudeBtn"
        :disabled="extrudeLoading || !!extrudeDistanceError"
        data-testid="extrude-apply"
        @click="handleExtrude"
      >
        {{ extrudeButtonLabel }}
      </button>
    </div>
    </template>

    <template v-else>
    <div :class="$style.panelHead">{{ t("editorPanels.revolve_parameters") }}</div>
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.angle") }}</span>
        <span :class="$style.fieldExpr">°</span>
      </div>
      <div :class="$style.fieldInput">
        <input
          v-model="revolveAngleExpr"
          type="text"
          inputmode="decimal"
          :class="[$style.numberInput, revolveAngleError && $style.inputInvalid]"
          :title="t('editorPanels.angle_input_hint')"
          data-testid="revolve-angle"
          @input="revolveAngleField.onInput"
          @change="revolveAngleField.commit"
          @keyup.enter="revolveAngleField.commit"
        />
        <span :class="$style.fieldUnit">°</span>
      </div>
      <div v-if="revolveAngleError" :class="$style.hint" data-testid="revolve-angle-error">
        {{ revolveAngleError }}
      </div>
    </div>
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.axis") }}</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="revolveAxis" :class="$style.selectInput">
          <option value="y">{{ t("editorPanels.axis_y") }}</option>
          <option value="x">{{ t("editorPanels.axis_x") }}</option>
        </select>
      </div>
    </div>
    <div :class="$style.field">
      <div :class="$style.fieldLabel">
        <span>{{ t("editorPanels.axis_origin_x") }}</span>
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
        <span>{{ t("editorPanels.axis_origin_y") }}</span>
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
        <span>{{ t("editorPanels.direction") }}</span>
      </div>
      <div :class="$style.fieldInput">
        <select v-model="revolveDirection" :class="$style.selectInput">
          <option value="one_side">{{ t("editorPanels.one_side") }}</option>
          <option value="symmetric">{{ t("editorPanels.symmetric") }}</option>
        </select>
      </div>
    </div>
    <div v-if="revolveError" :class="$style.conflictWarning">
      {{ revolveError }}
    </div>
    <div :class="$style.field" style="margin-top:16px">
      <button
        :class="[$style.extrudeBtn, $style.revolveBtn]"
        :disabled="revolveLoading || !!revolveAngleError"
        data-testid="revolve-apply"
        @click="handleRevolve"
      >
        {{ revolveLoading ? t('editorPanels.revolving') : t('editorPanels.revolve') }}
      </button>
    </div>
    </template>
    <template #foot>
      <button :class="$style.cancelBtn" @click="cancel">{{ t("editorPanels.cancel_esc") }}</button>
    </template>
  </PropsPanelShell>
</template>

<style module>
.panelHead {
  font-family: var(--kr-font-mono);
  font-size: 11px;
  color: var(--kr-text-secondary);
  letter-spacing: 0.04em;
  margin-bottom: 13px;
}

.field {
  margin-bottom: 13px;
}

.fieldLabel {
  font-size: 12px;
  color: var(--kr-text-secondary);
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
}

.fieldExpr {
  font-family: var(--kr-font-mono);
  color: var(--kr-text-muted);
}

.fieldInput {
  display: flex;
  align-items: center;
  background: var(--kr-surface-sunken);
  border: 1px solid var(--kr-border-strong);
  border-radius: 7px;
  padding: 9px 12px;
  transition: border-color var(--kr-transition-fast);
}

.fieldInput:hover {
  border-color: var(--kr-primary-border);
}

.fieldValue {
  font-family: var(--kr-font-mono);
  font-size: 14px;
  font-weight: var(--kr-font-weight-medium);
  color: var(--kr-text);
}

.fieldUnit {
  margin-left: auto;
  font-family: var(--kr-font-mono);
  font-size: 12px;
  color: var(--kr-amber-strong);
}

.numberInput {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--kr-font-mono);
  font-size: 14px;
  font-weight: var(--kr-font-weight-medium);
  color: var(--kr-text);
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
  font-family: var(--kr-font-mono);
  font-size: 13px;
  color: var(--kr-text);
  cursor: pointer;
}

.note {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--kr-text-muted);
}

.hint {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--kr-red-strong);
}

.toggleRow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--kr-text-secondary);
  cursor: pointer;
}

.toggleHint {
  margin-left: auto;
  font-family: var(--kr-font-mono);
  font-size: 11px;
  color: var(--kr-text-muted);
}

.inputInvalid {
  border-color: var(--kr-error) !important;
  color: var(--kr-red-strong);
}

.conflictWarning {
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: 7px;
  background: oklch(0.96 0.025 25);
  border: 1px solid oklch(0.65 0.16 25 / 0.5);
  color: var(--kr-red-strong);
  font-size: 12px;
  line-height: 1.5;
}

.extrudeBtn {
  width: 100%;
  cursor: pointer;
  background: var(--kr-primary);
  color: var(--kr-primary-fg);
  font-weight: var(--kr-font-weight-bold);
  font-size: 14px;
  padding: 10px;
  border: none;
  border-radius: 7px;
  transition: background var(--kr-transition-fast), opacity var(--kr-transition-fast);
}

.extrudeBtn:hover:not(:disabled) {
  background: var(--kr-primary-hover);
}

.extrudeBtn:disabled {
  background: var(--kr-surface-sunken);
  color: var(--kr-text-disabled);
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
  border: 1px solid var(--kr-border-strong);
  font-size: 13px;
  padding: 9px;
  border-radius: 7px;
  color: var(--kr-text);
  transition: border-color var(--kr-transition-fast);
}

.cancelBtn:hover {
  border-color: var(--kr-text-muted);
}
</style>
