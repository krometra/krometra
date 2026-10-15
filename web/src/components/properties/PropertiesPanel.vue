<script setup lang="ts">
import { ref, computed } from "vue";
import { usePropertiesPanel } from "@/composables/usePropertiesPanel";
import { useDisplayNames } from "@/composables/useDisplayNames";
import CsTabs from "@/components/ui/CsTabs.vue";
import CsCollapsible from "@/components/ui/CsCollapsible.vue";
import FeatureParamsEditor from "./FeatureParamsEditor.vue";
import { editableValues, featureParamFields } from "@/lib/browserFeatureParams";
import { transformParams } from "@/lib/bodyTransform";
import { mirrorParams } from "@/lib/mirrorPlane";
import { holeSummaryRows } from "@/lib/holeFeature";
import { patternParamRows } from "@/lib/bodyPatternParams";
import type { MeshData, TimelineEntry } from "@/types/api";

const emit = defineEmits<{
  "edit-sketch": [sketchId: string];
  rebuilt: [payload: { bodyId: string; mesh: MeshData }];
}>();

const TAB_OPTIONS = [
  { id: "properties", label: "Свойства" },
  { id: "data", label: "Данные" },
];

const activeTab = ref("properties");

const panel = usePropertiesPanel();
const names = useDisplayNames();

const DIRECTION_LABELS: Record<string, string> = {
  one_side: "Одностороннее",
  symmetric: "Симметричное",
};

const OPERATION_LABELS: Record<string, string> = {
  new_body: "Новое тело",
  join: "Приклеить",
  cut: "Вырезать",
  union: "Объединение",
  subtract: "Вычитание",
  intersect: "Пересечение",
};

// ── Feature kind helpers ──

const featureEntry = computed<TimelineEntry | null>(() =>
  panel.mode.value.type === "feature" ? panel.mode.value.props.entry : null
);

const isSketchFeature = computed(() => featureEntry.value?.kind === "sketch");
const isReadonlyFeature = computed(() =>
  ["extrude", "revolve", "sweep", "fillet", "chamfer", "boolean", "thread", "import", "transform", "shell", "mirror", "hole", "pattern"].includes(featureEntry.value?.kind ?? "")
);
const editableLabels = computed(() => {
  const entry = featureEntry.value;
  return new Set(entry ? featureParamFields(entry, editableValues(entry)).map((field) => field.label) : []);
});
const isEditableFeature = computed(() => editableLabels.value.size > 0);
const isFace = computed(() => panel.mode.value.type === "face");
const isEdge = computed(() => panel.mode.value.type === "edge");
const isVertex = computed(() => panel.mode.value.type === "vertex");

const featureTitle = computed(() => {
  const entry = featureEntry.value;
  if (entry) return names.entryLabel(entry);
  return panel.title.value;
});

const readonlyParams = computed<{ label: string; value: string }[]>(() => {
  const entry = featureEntry.value;
  if (!entry) return [];
  const p = entry.params ?? {};
  switch (entry.kind) {
    case "extrude":
      return [
        { label: "Расстояние", value: `${typeof p.distance === "number" ? Math.abs(p.distance) : "?"} мм` },
        { label: "Направление", value: DIRECTION_LABELS[String(p.direction)] ?? "—" },
      ];
    case "revolve":
      return [
        { label: "Угол", value: `${p.angle ?? "?"}°` },
        { label: "Направление", value: DIRECTION_LABELS[String(p.direction)] ?? "—" },
      ];
    case "sweep":
      return [
        { label: "Путь", value: typeof p.path_sketch_id === "string" ? names.sketchLabel(p.path_sketch_id) : "—" },
        { label: "Ориентация", value: p.orientation === "frenet" ? "По Френе" : "Без закрутки" },
      ];
    case "fillet":
      return [
        { label: "Радиус", value: `${p.radius ?? "?"} мм` },
        { label: "Рёбер", value: String(Array.isArray(p.edge_ids) ? p.edge_ids.length : 0) },
      ];
    case "chamfer":
      return [
        { label: "Расстояние 1", value: `${p.distance1 ?? "?"} мм` },
        { label: "Расстояние 2", value: `${p.distance2 ?? "?"} мм` },
        { label: "Рёбер", value: String(Array.isArray(p.edge_ids) ? p.edge_ids.length : 0) },
      ];
    case "thread":
      return [
        { label: "Тип", value: p.kind === "internal" ? "Внутренняя" : "Внешняя" },
        { label: "Шаг", value: `${p.pitch ?? "?"} мм` },
        { label: "Длина", value: `${typeof p.length === "number" ? p.length.toFixed(1) : "?"} мм` },
        { label: "Отступ", value: `${p.offset ?? 0} мм` },
      ];
    case "import":
      return [
        { label: "Файл", value: typeof p.file_name === "string" ? p.file_name : "—" },
        { label: "Тело в файле", value: `${Number(p.body_index ?? 0) + 1} из ${p.body_count ?? 1}` },
      ];
    case "transform":
      return transformParams(p);
    case "shell":
      return [
        { label: "Толщина стенки", value: `${p.thickness ?? "?"} мм` },
        { label: "Направление", value: p.direction === "outward" ? "Наружу" : "Внутрь" },
        { label: "Открытых граней", value: String(Array.isArray(p.face_ids) ? p.face_ids.length : 0) },
      ];
    case "mirror":
      return mirrorParams(p);
    case "hole":
      return holeSummaryRows(p);
    case "pattern":
      return patternParamRows(p, names.bodyLabel);
    case "boolean":
      return [
        { label: "Операция", value: OPERATION_LABELS[entry.operation ?? ""] ?? entry.operation ?? "?" },
        { label: "Целевое тело", value: entry.target_body_id ? names.bodyLabel(entry.target_body_id) : "—" },
        { label: "Инструмент", value: entry.tool_body_id ? names.bodyLabel(entry.tool_body_id) : "—" },
      ];
    default:
      return [];
  }
});

const selectionInfo = computed<{ label: string; value: string }[]>(() => {
  const entry = featureEntry.value;
  if (!entry) return [];
  const rows: { label: string; value: string }[] = [];
  if (entry.sketch_id) rows.push({ label: "Эскиз", value: names.sketchLabel(entry.sketch_id) });
  const op = entry.params?.operation as string | undefined;
  if (op) rows.push({ label: "Операция", value: OPERATION_LABELS[op] ?? op });
  const target = entry.params?.target_body_id as string | undefined;
  if (target) rows.push({ label: "Целевое тело", value: names.bodyLabel(target) });
  if (entry.body_id) rows.push({ label: "Тело", value: names.bodyLabel(entry.body_id) });
  return rows;
});
</script>

<template>
  <div :class="$style.panel">
    <!-- No selection placeholder -->
    <template v-if="panel.mode.value.type === 'none'">
      <div :class="$style.placeholder">
        <div :class="$style.placeholderIcon">◻</div>
        <div :class="$style.placeholderTitle">Нет выделения</div>
        <div :class="$style.placeholderHint">
          Выберите тело, грань, ребро или операцию в истории
        </div>
      </div>
    </template>

    <template v-else>
      <!-- Tabs -->
      <CsTabs :tabs="TAB_OPTIONS" v-model="activeTab" />

      <!-- Properties tab -->
      <div v-if="activeTab === 'properties'" :class="$style.body">
        <!-- Feature header -->
        <div :class="$style.head">
          <span :class="$style.dot" />
          <span :class="$style.title">{{ featureTitle }}</span>
          <span :class="$style.kind">{{ panel.kindLabel.value }}</span>
        </div>

        <!-- ── Feature properties ── -->
        <template v-if="panel.mode.value.type === 'feature'">
          <!-- Sketch feature -->
          <template v-if="isSketchFeature">
            <CsCollapsible label="Эскиз" :open="true">
              <div :class="$style.fieldGroup">
                <div :class="$style.readonly">
                  <span :class="$style.readonlyLabel">Плоскость</span>
                  <span :class="$style.readonlyValue">{{ featureEntry?.plane ?? "—" }}</span>
                </div>
                <div :class="$style.readonly">
                  <span :class="$style.readonlyLabel">Объектов</span>
                  <span :class="$style.readonlyValue">{{ featureEntry?.entity_count ?? 0 }}</span>
                </div>
                <button
                  v-if="featureEntry?.sketch_id"
                  :class="$style.actionBtn"
                  @click="emit('edit-sketch', featureEntry.sketch_id!)"
                >
                  Редактировать эскиз
                </button>
              </div>
            </CsCollapsible>
          </template>

          <!-- Feature parameters -->
          <CsCollapsible v-if="isReadonlyFeature" label="Параметры операции" :open="true">
            <div :class="$style.fieldGroup">
              <FeatureParamsEditor v-if="isEditableFeature" :entry="featureEntry" @rebuilt="emit('rebuilt', $event)" />
              <template v-for="row in readonlyParams" :key="row.label">
                <div v-if="!editableLabels.has(row.label)" :class="$style.readonly">
                  <span :class="$style.readonlyLabel">{{ row.label }}</span>
                  <span :class="$style.readonlyValue">{{ row.value }}</span>
                </div>
              </template>
              <div v-if="!isEditableFeature" :class="$style.autoHint">
                Редактирование этой операции задним числом пока не поддерживается
              </div>
            </div>
          </CsCollapsible>

          <!-- Selection / context section -->
          <CsCollapsible v-if="selectionInfo.length > 0" label="Связи" :open="true">
            <div :class="$style.fieldGroup">
              <div v-for="row in selectionInfo" :key="row.label" :class="$style.readonly">
                <span :class="$style.readonlyLabel">{{ row.label }}</span>
                <span :class="$style.readonlyValue">{{ row.value }}</span>
              </div>
            </div>
          </CsCollapsible>
        </template>

        <!-- ── Face properties ── -->
        <template v-if="isFace">
          <CsCollapsible label="Геометрия" :open="true">
            <div :class="$style.fieldGroup">
              <div :class="$style.readonly">
                <span :class="$style.readonlyLabel">Тело</span>
                <span :class="$style.readonlyValue">{{ panel.mode.value.type === 'face' ? names.bodyLabel(panel.mode.value.props.bodyId) : '' }}</span>
              </div>
              <div :class="$style.readonly">
                <span :class="$style.readonlyLabel">Грань</span>
                <span :class="$style.readonlyValue">#{{ panel.mode.value.type === 'face' ? panel.mode.value.props.faceId : '' }}</span>
              </div>
            </div>
          </CsCollapsible>
        </template>

        <!-- ── Edge properties ── -->
        <template v-if="isEdge">
          <CsCollapsible label="Геометрия" :open="true">
            <div :class="$style.fieldGroup">
              <div :class="$style.readonly">
                <span :class="$style.readonlyLabel">Тело</span>
                <span :class="$style.readonlyValue">{{ panel.mode.value.type === 'edge' ? names.bodyLabel(panel.mode.value.props.bodyId) : '' }}</span>
              </div>
              <div :class="$style.readonly">
                <span :class="$style.readonlyLabel">Ребро</span>
                <span :class="$style.readonlyValue">#{{ panel.mode.value.type === 'edge' ? panel.mode.value.props.edgeId : '' }}</span>
              </div>
            </div>
          </CsCollapsible>
        </template>

        <!-- ── Vertex properties ── -->
        <template v-if="isVertex">
          <CsCollapsible label="Геометрия" :open="true">
            <div :class="$style.fieldGroup">
              <div :class="$style.readonly">
                <span :class="$style.readonlyLabel">Тело</span>
                <span :class="$style.readonlyValue">{{ panel.mode.value.type === 'vertex' ? names.bodyLabel(panel.mode.value.props.bodyId) : '' }}</span>
              </div>
            </div>
          </CsCollapsible>
        </template>
      </div>

      <!-- Data tab -->
      <div v-else-if="activeTab === 'data'" :class="$style.body">
        <CsCollapsible label="Данные фичи" :open="true">
          <div :class="$style.fieldGroup">
            <div
              v-if="panel.mode.value.type === 'feature'"
              :class="$style.readonly"
            >
              <span :class="$style.readonlyLabel">ID</span>
              <span :class="$style.readonlyValue">{{ panel.mode.value.props.entry.id }}</span>
            </div>
            <div
              v-if="panel.mode.value.type === 'feature'"
              :class="$style.readonly"
            >
              <span :class="$style.readonlyLabel">Тип</span>
              <span :class="$style.readonlyValue">{{ panel.mode.value.props.entry.kind }}</span>
            </div>
            <div
              v-if="panel.mode.value.type === 'feature'"
              :class="$style.readonly"
            >
              <span :class="$style.readonlyLabel">Статус</span>
              <span :class="$style.readonlyValue">{{ panel.mode.value.props.entry.status }}</span>
            </div>
            <div
              v-if="panel.mode.value.type === 'feature' && panel.mode.value.props.entry.body_id"
              :class="$style.readonly"
            >
              <span :class="$style.readonlyLabel">Body ID</span>
              <span :class="$style.readonlyValue">{{ panel.mode.value.props.entry.body_id }}</span>
            </div>
          </div>
        </CsCollapsible>
      </div>
    </template>
  </div>
</template>

<style module>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--cs-surface-alt);
}

.body {
  flex: 1;
  overflow: auto;
  padding: var(--cs-spacing-sm) var(--cs-spacing-md);
}

.head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: var(--cs-spacing-sm) 0;
  margin-bottom: var(--cs-spacing-sm);
  border-bottom: 1px solid var(--cs-border-subtle);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cs-primary);
  flex-shrink: 0;
}

.title {
  font-size: 13px;
  font-weight: var(--cs-font-weight-bold);
  color: var(--cs-text);
}

.kind {
  margin-left: auto;
  font-family: var(--cs-font-mono);
  font-size: 10px;
  color: var(--cs-text-muted);
}

.fieldGroup {
  display: flex;
  flex-direction: column;
  gap: var(--cs-spacing-sm);
  padding-bottom: var(--cs-spacing-xs);
}

.readonly {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--cs-spacing-xs) 0;
  font-size: var(--cs-font-size-sm);
}

.readonlyLabel {
  color: var(--cs-text-secondary);
}

.readonlyValue {
  font-family: var(--cs-font-mono);
  font-size: var(--cs-font-size-sm);
  color: var(--cs-amber-strong);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actionBtn {
  cursor: pointer;
  align-self: flex-start;
  padding: 6px 12px;
  border: 1px solid var(--cs-primary);
  border-radius: var(--cs-radius-md);
  background: transparent;
  color: var(--cs-primary);
  font-size: var(--cs-font-size-sm);
  transition: background var(--cs-transition-fast);
}

.actionBtn:hover {
  background: var(--cs-primary-soft);
}

.autoHint {
  font-size: 11px;
  color: var(--cs-text-muted);
}

/* ── Placeholder ── */

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: var(--cs-spacing-xl);
  text-align: center;
}

.placeholderIcon {
  font-size: 32px;
  color: var(--cs-text-muted);
  margin-bottom: var(--cs-spacing-md);
}

.placeholderTitle {
  font-size: var(--cs-font-size-md);
  font-weight: var(--cs-font-weight-bold);
  color: var(--cs-text-secondary);
  margin-bottom: var(--cs-spacing-xs);
}

.placeholderHint {
  font-size: var(--cs-font-size-sm);
  color: var(--cs-text-muted);
  line-height: 1.5;
  max-width: 200px;
}
</style>
