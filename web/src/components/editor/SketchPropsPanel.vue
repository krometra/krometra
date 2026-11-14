<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
import { useSketchText } from "@/composables/sketcher/useSketchText";
const { t } = useI18n();
const sketchText = useSketchText();
import { computed, nextTick, ref, useCssModule, watch } from "vue";
import { useSketch } from "@/composables/shared/useSketch";
import { useDocument } from "@/composables/shared/useDocument";
import { isWorkPlane } from "@/lib/workPlaneDocument";
import { useDisplayNames } from "@/composables/useDisplayNames";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { SketchConstraint } from "@/types/api";
import KrNumberInput from "@/components/ui/KrNumberInput.vue";
import { isDimensionType } from "@/sketcher/dimensionKinds";
import { SKETCH_ORIGIN_ID } from "@/sketcher/sketchOrigin";
import { CONSTRAINT_ICONS, CONSTRAINT_TITLES } from "@/sketcher/constraintNames";
import { useSketchConstraintFocus } from "@/composables/shared/useSketchConstraintFocus";

const emit = defineEmits<{ ok: []; cancel: [] }>();

const sketch = useSketch();
const style = useCssModule();
const names = useDisplayNames();
const documentStore = useDocument();

const workPlaneLabel = computed(() => {
  const planeId = sketch.refPlaneId.value;
  const plane = planeId ? documentStore.document.value?.components?.[planeId] : null;
  return planeId && isWorkPlane(plane) ? names.names.value[planeId] ?? plane.label : null;
});

const sketchPlaneLabel = computed(() => {
  if (workPlaneLabel.value) return t("editorPanels.sketch_work_plane", { name: workPlaneLabel.value });
  if (sketch.refBodyId.value !== null) {
    const face = sketch.refFaceId.value !== null ? t("editorPanels.face_number", { id: sketch.refFaceId.value }) : t("editorPanels.face");
    return t("editorPanels.face_body", { face, body: names.bodyLabel(sketch.refBodyId.value) });
  }
  return t("editorPanels.base_plane", { plane: sketch.sketchPlane.value });
});

const sketchPlaneHint = computed(() => {
  const offset = sketch.planeOffset.value;
  if (sketch.refBodyId.value !== null || workPlaneLabel.value) {
    const orientation = t("editorPanels.in_plane", { plane: sketch.sketchPlane.value });
    return offset !== 0 ? t("editorPanels.plane_offset_hint", { orientation, offset: offset.toFixed(1) }) : orientation;
  }
  return offset !== 0 ? t("editorPanels.plane_offset_value", { offset: offset.toFixed(1) }) : "";
});

const ENTITY_KIND_LABELS = computed<Record<string, string>>(() => ({
  line: t("editorPanels.line_entity"),
  rectangle: t("editorPanels.rectangle_entity"),
  circle: t("editorPanels.circle_entity"),
  arc: t("editorPanels.arc_entity"),
  infline: t("editorPanels.construction_entity"),
}));

const entityLabels = computed(() => {
  const counters: Record<string, number> = {};
  const map = new Map<string, string>([[SKETCH_ORIGIN_ID, t("editorPanels.tree_origin")]]);
  for (const e of sketch.entities.value) {
    counters[e.type] = (counters[e.type] ?? 0) + 1;
    map.set(e.id, `${ENTITY_KIND_LABELS.value[e.type] ?? e.type} ${counters[e.type]}`);
  }
  return map;
});

const focus = useSketchConstraintFocus();

function constraintTitle(c: SketchConstraint): string {
  return sketchText(CONSTRAINT_TITLES[c.type] ?? c.type);
}

function rowClass(c: SketchConstraint) {
  return [style.constraintRow, c.id === focus.selectedId.value && style.constraintRowSelected, c.id === focus.hoveredId.value && style.constraintRowHovered];
}

const rows = ref<HTMLElement | null>(null);

watch(focus.selectedId, async (id) => {
  if (id === null) return;
  await nextTick();
  rows.value?.querySelector(`[data-constraint-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
});

function constraintTargets(c: SketchConstraint): string {
  return c.anchors
    .map((a) => entityLabels.value.get(a.entity_id) ?? "?")
    .join(" · ");
}

function isDimensional(c: SketchConstraint): boolean {
  return isDimensionType(c.type);
}

function constraintUnit(c: SketchConstraint): string {
  return c.type === "angle" ? "°" : t("editorPanels.mm");
}

function setConstraintValue(c: SketchConstraint, value: number) {
  if (!Number.isFinite(value) || value === c.value) return;
  sketch.updateConstraintValue(c.id, value);
}
</script>

<template>
  <PropsPanelShell :title="t('editorPanels.sketch')" kind="SKETCH" dot-color="oklch(0.78 0.13 75)">
    <div :class="$style.panelHead">{{ t("editorPanels.sketch_plane_header") }}</div>
    <div :class="$style.field">
      <div :class="$style.fieldInput">
        <span :class="$style.fieldValue" data-testid="sketch-plane-label">{{ sketchPlaneLabel }}</span>
      </div>
      <div v-if="sketchPlaneHint" :class="$style.fieldHint">{{ sketchPlaneHint }}</div>
    </div>
    <div :class="$style.panelHead" style="margin-top:16px">{{ t("editorPanels.entities_header") }}</div>
    <div :class="$style.field">
      <div :class="$style.fieldInput">
        <span :class="$style.fieldValue">{{ sketch.entities.value.length }}</span>
        <span :class="$style.fieldUnit">{{ t("editorPanels.count_unit") }}</span>
      </div>
    </div>
    <div v-if="sketch.conflict.value" :class="$style.conflictWarning">
      {{ t("editorPanels.sketch_conflict") }}
    </div>
    <div v-if="sketch.constraints.value.length > 0" ref="rows" :class="$style.constraintSection">
      <div :class="$style.panelHead">{{ t("editorPanels.constraints_count", { count: sketch.constraints.value.length }) }}</div>
      <div
        v-for="c in sketch.constraints.value"
        :key="c.id"
        :class="rowClass(c)"
        data-testid="sketch-constraint-row"
        :data-constraint-id="c.id"
        :data-selected="c.id === focus.selectedId.value ? 'true' : undefined"
        :data-hovered="c.id === focus.hoveredId.value ? 'true' : undefined"
        @click="focus.select(c.id)"
        @mouseenter="focus.hover(c.id)"
        @mouseleave="focus.hover(null)"
      >
        <span :class="$style.constraintIcon">{{ CONSTRAINT_ICONS[c.type] ?? c.type }}</span>
        <div :class="$style.constraintBody">
          <div :class="$style.constraintTitle">{{ constraintTitle(c) }}</div>
          <div :class="$style.constraintTargets">{{ constraintTargets(c) }}</div>
          <KrNumberInput
            v-if="isDimensional(c)"
            :model-value="c.value ?? 0"
            :step="c.type === 'angle' ? 1 : 0.5"
            :suffix="constraintUnit(c)"
            @update:model-value="setConstraintValue(c, $event)"
          />
        </div>
        <button
          :class="$style.constraintDel"
          :title="t('editorPanels.delete_constraint')"
          @click.stop="sketch.removeConstraint(c.id)"
        >
          ✕
        </button>
      </div>
    </div>
    <div v-if="sketch.isSolving.value" :class="$style.solvingHint">
      {{ t("editorPanels.solver_residual", { value: sketch.solveResidual.value.toFixed(4) }) }}
    </div>
    <template #foot>
      <button :class="$style.okBtn" @click="emit('ok')">{{ t("editorPanels.ok") }}</button>
      <button :class="$style.cancelBtn" @click="emit('cancel')">{{ t("editorPanels.cancel") }}</button>
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

.fieldHint {
  margin-top: 5px;
  font-family: var(--kr-font-mono);
  font-size: 11px;
  color: var(--kr-text-secondary);
}

.fieldUnit {
  margin-left: auto;
  font-family: var(--kr-font-mono);
  font-size: 12px;
  color: var(--kr-amber-strong);
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

.constraintRow {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--kr-border-subtle);
  font-size: 12px;
  color: var(--kr-text-secondary);
  transition: background 0.1s;
}

.constraintRow:hover {
  background: oklch(0.78 0.13 75 / 0.05);
  color: var(--kr-text);
}

.constraintRowSelected,
.constraintRowSelected:hover {
  background: var(--kr-primary-soft);
  color: var(--kr-text);
}

.constraintRowHovered {
  background: oklch(0.78 0.13 75 / 0.05);
  color: var(--kr-text);
}

.constraintIcon {
  font-family: var(--kr-font-mono, monospace);
  font-size: 13px;
  color: var(--kr-amber-strong);
  width: 24px;
  text-align: center;
  flex-shrink: 0;
  line-height: 1.5;
}

.constraintSection {
  margin-top: 16px;
}

.constraintBody {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.constraintTitle {
  font-size: 12px;
  color: var(--kr-text);
}

.constraintTargets {
  font-family: var(--kr-font-mono, monospace);
  font-size: 10px;
  color: var(--kr-text-muted, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.constraintDel {
  cursor: pointer;
  background: transparent;
  border: none;
  color: var(--kr-text-disabled);
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.constraintDel:hover {
  background: oklch(0.65 0.16 25 / 0.15);
  color: var(--kr-red-strong);
}

.solvingHint {
  margin-top: 10px;
  font-family: var(--kr-font-mono, monospace);
  font-size: 10px;
  color: var(--kr-amber-strong);
  text-align: center;
}

.okBtn {
  flex: 1;
  cursor: pointer;
  background: var(--kr-primary);
  color: var(--kr-primary-fg);
  font-weight: var(--kr-font-weight-bold);
  font-size: 13px;
  padding: 9px;
  border: none;
  border-radius: 7px;
  transition: background var(--kr-transition-fast);
}

.okBtn:hover {
  background: var(--kr-primary-hover);
}

.cancelBtn {
  flex: 1;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--kr-border-strong);
  font-size: 13px;
  padding: 9px;
  border-radius: 7px;
  color: var(--kr-text-secondary);
  transition: border-color var(--kr-transition-fast);
}

.cancelBtn:hover {
  border-color: var(--kr-text-muted);
}
</style>
