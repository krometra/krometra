<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
const { t } = useI18n();
import { computed } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrInput from "@/components/ui/KrInput.vue";
import KrSelect from "@/components/ui/KrSelect.vue";
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
  if (ref.kind === "base") return t("editorPanels.plane_name", { name: ref.plane });
  if (ref.kind === "sketch") return t("editorPanels.sketch_plane_name", { name: names.sketchLabel(ref.sketchId) });
  return t("editorPanels.named_face_body", { face: ref.faceName, body: names.bodyLabel(ref.bodyId) });
}

function axisText(ref: AxisRef | null): string {
  if (!ref) return t("editorPanels.not_selected");
  if (ref.kind === "edge") return t("editorPanels.named_edge_body", { edge: ref.edgeName, body: names.bodyLabel(ref.bodyId) });
  return sketchLineOptions.value.find((option) => option.value === axisSketchValue.value)?.label ?? t("editorPanels.sketch_segment");
}

function pointText(ref: PointRef): string {
  if (ref.kind === "vertex") return t("editorPanels.named_vertex_body", { edge: ref.edgeName, body: names.bodyLabel(ref.bodyId) });
  return t("editorPanels.sketch_point_name", { name: names.sketchLabel(ref.sketchId) });
}

function updateField(field: QuantityField, text: string) {
  field.text.value = text;
  field.onInput();
}

const statusText = computed(() => {
  if (pickHint.value) return pickHint.value;
  if (preview.value.error) return preview.value.error;
  if (preview.value.frame) return t("editorPanels.preview_plane");
  if (kind.value === "angle") return t("editorPanels.select_axis");
  if (kind.value === "three_points") return t("editorPanels.points_selected", { count: points.value.length });
  if (kind.value === "midplane") return t("editorPanels.faces_selected", { count: faces.value.length });
  return t("editorPanels.select_support");
});
</script>

<template>
  <PropsPanelShell :title="editingId ? t('editorPanels.edit_plane') : t('editorPanels.work_plane')" kind="CONSTRUCTION" dot-color="oklch(0.76 0.13 80)">
    <div :class="$style.body" data-testid="work-plane-panel">
      <div :class="$style.row">
        <KrButton
          v-for="option in kinds"
          :key="option"
          size="sm"
          :variant="kind === option ? 'primary' : 'secondary'"
          :data-testid="`work-plane-kind-${option}`"
          @click="tool.setKind(option)"
        >
          {{ WORK_PLANE_KIND_LABELS[option] }}
        </KrButton>
      </div>

      <p :class="[$style.status, canApply && $style.statusReady]" data-testid="work-plane-status">{{ statusText }}</p>

      <div v-if="kind === 'angle'" :class="$style.field">
        <span :class="$style.label">{{ t("editorPanels.axis_label", { name: axisText(axis) }) }}</span>
        <div :class="$style.row">
          <KrButton size="sm" :variant="picking === 'axis' ? 'primary' : 'secondary'" data-testid="work-plane-axis-edge" @click="tool.startPicking('axis')">
            {{ t("editorPanels.edge") }}
          </KrButton>
        </div>
        <KrSelect
          v-if="sketchLineOptions.length > 0"
          :model-value="axisSketchValue"
          :options="sketchLineOptions"
          :placeholder="t('editorPanels.choose_segment')"
          data-testid="work-plane-axis-sketch"
          @update:model-value="tool.selectSketchLine"
        />
      </div>

      <div v-if="usesReference" :class="$style.field">
        <span :class="$style.label">{{ kind === 'angle' ? t('editorPanels.angle_from') : t('editorPanels.reference_plane') }}: {{ referenceText(reference) }}</span>
        <div :class="$style.row">
          <KrButton
            v-for="plane in WORK_PLANE_BASES"
            :key="plane"
            size="sm"
            :variant="reference.kind === 'base' && reference.plane === plane ? 'primary' : 'secondary'"
            :data-testid="`work-plane-ref-${plane}`"
            @click="tool.selectBasePlane(plane)"
          >
            {{ plane }}
          </KrButton>
          <KrButton
            size="sm"
            :variant="picking === 'reference' || reference.kind === 'face' ? 'primary' : 'secondary'"
            data-testid="work-plane-ref-face"
            @click="tool.startPicking('reference')"
          >
            {{ t("editorPanels.face") }}
          </KrButton>
        </div>
      </div>

      <div v-if="kind === 'offset'" :class="$style.field" data-testid="work-plane-distance">
        <KrInput
          :model-value="tool.distanceField.text.value"
          :label="t('editorPanels.distance_mm')"
          :error="tool.distanceField.error.value ?? undefined"
          :hint="t('editorPanels.plane_distance_hint')"
          @update:model-value="updateField(tool.distanceField, $event)"
        />
      </div>

      <div v-if="kind === 'angle'" :class="$style.field" data-testid="work-plane-angle">
        <KrInput
          :model-value="tool.angleField.text.value"
          :label="t('editorPanels.angle_deg')"
          :error="tool.angleField.error.value ?? undefined"
          :hint="t('editorPanels.plane_angle_hint')"
          @update:model-value="updateField(tool.angleField, $event)"
        />
      </div>

      <div v-if="kind === 'three_points'" :class="$style.field">
        <span :class="$style.label">{{ t("editorPanels.points") }}</span>
        <div v-for="(point, index) in points" :key="index" :class="$style.item">
          <span>{{ index + 1 }}. {{ pointText(point) }}</span>
          <KrButton size="sm" variant="ghost" @click="tool.removePoint(index)">{{ t("editorPanels.remove") }}</KrButton>
        </div>
        <KrButton size="sm" :variant="picking === 'points' ? 'primary' : 'secondary'" data-testid="work-plane-points-pick" @click="tool.startPicking('points')">
          {{ t("editorPanels.choose_vertices") }}
        </KrButton>
      </div>

      <div v-if="kind === 'midplane'" :class="$style.field">
        <span :class="$style.label">{{ t("editorPanels.faces_label") }}</span>
        <div v-for="(face, index) in faces" :key="index" :class="$style.item">
          <span>{{ index + 1 }}. {{ t("editorPanels.named_face_body", { face: face.faceName, body: names.bodyLabel(face.bodyId) }) }}</span>
          <KrButton size="sm" variant="ghost" @click="tool.removeFace(index)">{{ t("editorPanels.remove") }}</KrButton>
        </div>
        <KrButton size="sm" :variant="picking === 'faces' ? 'primary' : 'secondary'" data-testid="work-plane-faces-pick" @click="tool.startPicking('faces')">
          {{ t("editorPanels.choose_faces") }}
        </KrButton>
      </div>

      <p v-if="error" :class="$style.error" data-testid="work-plane-error">{{ error }}</p>
    </div>

    <template #foot>
      <KrButton variant="primary" :disabled="!canApply" data-testid="work-plane-apply" @click="tool.apply">
        {{ loading ? t("editorPanels.saving") : t("editorPanels.apply") }}
      </KrButton>
      <KrButton variant="ghost" @click="tool.exit">{{ t("editorPanels.close") }}</KrButton>
    </template>
  </PropsPanelShell>
</template>

<style module>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-md);
  padding: var(--kr-spacing-md);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.status {
  margin: 0;
  font-size: var(--kr-font-size-xs);
  line-height: 1.45;
  color: var(--kr-text-muted);
}

.statusReady {
  color: var(--kr-text-secondary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-secondary);
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--kr-spacing-sm);
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text);
}

.error {
  margin: 0;
  font-size: var(--kr-font-size-xs);
  line-height: 1.45;
  color: var(--kr-danger);
}
</style>
