<script setup lang="ts">
import { computed } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsInput from "@/components/ui/CsInput.vue";
import CsSelect from "@/components/ui/CsSelect.vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { WORK_PLANE_BASES, WORK_PLANE_KIND_LABELS, type AxisRef, type PlaneRef, type PointRef, type WorkPlaneKind } from "@/lib/workPlane";
import type { QuantityField } from "@/composables/editor/useQuantityField";
import type { WorkPlaneToolApi } from "@/composables/editor/useWorkPlaneTool";
import PropsPanelShell from "./PropsPanelShell.vue";

const props = defineProps<{ tool: WorkPlaneToolApi }>();

const names = useDisplayNames();
const kinds = Object.keys(WORK_PLANE_KIND_LABELS) as WorkPlaneKind[];

const { kind, reference, axis, points, faces, picking, pickHint, preview, error, canApply, loading, editingId, sketchLineOptions } = props.tool;

const usesReference = computed(() => kind.value === "offset" || kind.value === "angle");
const axisSketchValue = computed(() => (axis.value?.kind === "sketch_line" ? `${axis.value.sketchId}:${axis.value.entityId}` : ""));

function referenceText(ref: PlaneRef): string {
  if (ref.kind === "base") return `Плоскость ${ref.plane}`;
  if (ref.kind === "sketch") return `Плоскость эскиза «${names.sketchLabel(ref.sketchId)}»`;
  return `Грань ${ref.faceName} · ${names.bodyLabel(ref.bodyId)}`;
}

function axisText(ref: AxisRef | null): string {
  if (!ref) return "не выбрана";
  if (ref.kind === "edge") return `Ребро ${ref.edgeName} · ${names.bodyLabel(ref.bodyId)}`;
  return sketchLineOptions.value.find((option) => option.value === axisSketchValue.value)?.label ?? "Отрезок эскиза";
}

function pointText(ref: PointRef): string {
  if (ref.kind === "vertex") return `Вершина ${ref.edgeName} · ${names.bodyLabel(ref.bodyId)}`;
  return `Точка эскиза «${names.sketchLabel(ref.sketchId)}»`;
}

function updateField(field: QuantityField, text: string) {
  field.text.value = text;
  field.onInput();
}

const statusText = computed(() => {
  if (pickHint.value) return pickHint.value;
  if (preview.value.error) return preview.value.error;
  if (preview.value.frame) return "Призрак показывает плоскость — нажмите «Применить».";
  if (kind.value === "angle") return "Выберите ось: прямое ребро тела или отрезок эскиза.";
  if (kind.value === "three_points") return `Выбрано точек: ${points.value.length} из 3.`;
  if (kind.value === "midplane") return `Выбрано граней: ${faces.value.length} из 2.`;
  return "Задайте опору и расстояние.";
});
</script>

<template>
  <PropsPanelShell :title="editingId ? 'Изменить плоскость' : 'Рабочая плоскость'" kind="CONSTRUCTION" dot-color="oklch(0.76 0.13 80)">
    <div :class="$style.body" data-testid="work-plane-panel">
      <div :class="$style.row">
        <CsButton
          v-for="option in kinds"
          :key="option"
          size="sm"
          :variant="kind === option ? 'primary' : 'secondary'"
          :data-testid="`work-plane-kind-${option}`"
          @click="tool.setKind(option)"
        >
          {{ WORK_PLANE_KIND_LABELS[option] }}
        </CsButton>
      </div>

      <p :class="[$style.status, canApply && $style.statusReady]" data-testid="work-plane-status">{{ statusText }}</p>

      <div v-if="kind === 'angle'" :class="$style.field">
        <span :class="$style.label">Ось: {{ axisText(axis) }}</span>
        <div :class="$style.row">
          <CsButton size="sm" :variant="picking === 'axis' ? 'primary' : 'secondary'" data-testid="work-plane-axis-edge" @click="tool.startPicking('axis')">
            Ребро
          </CsButton>
        </div>
        <CsSelect
          v-if="sketchLineOptions.length > 0"
          :model-value="axisSketchValue"
          :options="sketchLineOptions"
          placeholder="Отрезок эскиза…"
          data-testid="work-plane-axis-sketch"
          @update:model-value="tool.selectSketchLine"
        />
      </div>

      <div v-if="usesReference" :class="$style.field">
        <span :class="$style.label">{{ kind === 'angle' ? 'Угол отсчитывается от' : 'Опорная плоскость' }}: {{ referenceText(reference) }}</span>
        <div :class="$style.row">
          <CsButton
            v-for="plane in WORK_PLANE_BASES"
            :key="plane"
            size="sm"
            :variant="reference.kind === 'base' && reference.plane === plane ? 'primary' : 'secondary'"
            :data-testid="`work-plane-ref-${plane}`"
            @click="tool.selectBasePlane(plane)"
          >
            {{ plane }}
          </CsButton>
          <CsButton
            size="sm"
            :variant="picking === 'reference' || reference.kind === 'face' ? 'primary' : 'secondary'"
            data-testid="work-plane-ref-face"
            @click="tool.startPicking('reference')"
          >
            Грань
          </CsButton>
        </div>
      </div>

      <div v-if="kind === 'offset'" :class="$style.field" data-testid="work-plane-distance">
        <CsInput
          :model-value="tool.distanceField.text.value"
          label="Расстояние, мм"
          :error="tool.distanceField.error.value ?? undefined"
          hint="Можно выражение: 30/2, width + 5 mm. Знак задаёт сторону."
          @update:model-value="updateField(tool.distanceField, $event)"
        />
      </div>

      <div v-if="kind === 'angle'" :class="$style.field" data-testid="work-plane-angle">
        <CsInput
          :model-value="tool.angleField.text.value"
          label="Угол, °"
          :error="tool.angleField.error.value ?? undefined"
          hint="0° — параллельно опоре, 90° — перпендикулярно."
          @update:model-value="updateField(tool.angleField, $event)"
        />
      </div>

      <div v-if="kind === 'three_points'" :class="$style.field">
        <span :class="$style.label">Точки</span>
        <div v-for="(point, index) in points" :key="index" :class="$style.item">
          <span>{{ index + 1 }}. {{ pointText(point) }}</span>
          <CsButton size="sm" variant="ghost" @click="tool.removePoint(index)">Убрать</CsButton>
        </div>
        <CsButton size="sm" :variant="picking === 'points' ? 'primary' : 'secondary'" data-testid="work-plane-points-pick" @click="tool.startPicking('points')">
          Выбрать вершины
        </CsButton>
      </div>

      <div v-if="kind === 'midplane'" :class="$style.field">
        <span :class="$style.label">Грани</span>
        <div v-for="(face, index) in faces" :key="index" :class="$style.item">
          <span>{{ index + 1 }}. Грань {{ face.faceName }} · {{ names.bodyLabel(face.bodyId) }}</span>
          <CsButton size="sm" variant="ghost" @click="tool.removeFace(index)">Убрать</CsButton>
        </div>
        <CsButton size="sm" :variant="picking === 'faces' ? 'primary' : 'secondary'" data-testid="work-plane-faces-pick" @click="tool.startPicking('faces')">
          Выбрать грани
        </CsButton>
      </div>

      <p v-if="error" :class="$style.error" data-testid="work-plane-error">{{ error }}</p>
    </div>

    <template #foot>
      <CsButton variant="primary" :disabled="!canApply" data-testid="work-plane-apply" @click="tool.apply">
        {{ loading ? "Сохраняю…" : "Применить" }}
      </CsButton>
      <CsButton variant="ghost" @click="tool.exit">Закрыть</CsButton>
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

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
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

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cs-spacing-sm);
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text);
}

.error {
  margin: 0;
  font-size: var(--cs-font-size-xs);
  line-height: 1.45;
  color: var(--cs-danger);
}
</style>
