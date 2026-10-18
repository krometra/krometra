<script setup lang="ts">
import { ref, computed } from "vue";
import { usePropertiesPanel } from "@/composables/usePropertiesPanel";
import { useDisplayNames } from "@/composables/useDisplayNames";
import KrTabs from "@/components/ui/KrTabs.vue";
import KrCollapsible from "@/components/ui/KrCollapsible.vue";
import FeatureParamsEditor from "./FeatureParamsEditor.vue";
import { editableValues, featureParamFields } from "@/lib/browserFeatureParams";
import { transformParams } from "@/lib/bodyTransform";
import { mirrorParams } from "@/lib/mirrorPlane";
import { draftParams } from "@/lib/browserDraft";
import { holeSummaryRows } from "@/lib/holeFeature";
import { patternParamRows } from "@/lib/bodyPatternParams";
import { loftParamRows } from "@/lib/loftFeature";
import { pressPullParamRows } from "@/lib/browserPressPull";
import { booleanToolsOf, cutTargetsOf, keepsTools } from "@/lib/timelineFlags";
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
  ["extrude", "revolve", "sweep", "loft", "fillet", "chamfer", "boolean", "thread", "import", "transform", "shell", "mirror", "hole", "pattern", "draft", "press_pull"].includes(featureEntry.value?.kind ?? "")
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
    case "loft":
      return loftParamRows(p, names.sketchLabel);
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
    case "draft":
      return draftParams(p);
    case "hole":
      return holeSummaryRows(p);
    case "pattern":
      return patternParamRows(p, names.bodyLabel);
    case "press_pull":
      return pressPullParamRows(p);
    case "boolean":
      return [
        { label: "Операция", value: OPERATION_LABELS[entry.operation ?? ""] ?? entry.operation ?? "?" },
        { label: "Целевое тело", value: entry.target_body_id ? names.bodyLabel(entry.target_body_id) : "—" },
        { label: "Инструменты", value: booleanToolsOf(entry).map(names.bodyLabel).join(", ") || "—" },
        ...(keepsTools(entry) ? [{ label: "Сохранить инструменты", value: "да" }] : []),
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
  const targets = cutTargetsOf(entry);
  const target = entry.params?.target_body_id as string | undefined;
  if (targets.length > 0) rows.push({ label: "Тела для выреза", value: targets.map(names.bodyLabel).join(", ") });
  else if (target) rows.push({ label: "Целевое тело", value: names.bodyLabel(target) });
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
      <KrTabs :tabs="TAB_OPTIONS" v-model="activeTab" />

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
            <KrCollapsible label="Эскиз" :open="true">
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
            </KrCollapsible>
          </template>

          <!-- Feature parameters -->
          <KrCollapsible v-if="isReadonlyFeature" label="Параметры операции" :open="true">
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
          </KrCollapsible>

          <!-- Selection / context section -->
          <KrCollapsible v-if="selectionInfo.length > 0" label="Связи" :open="true">
            <div :class="$style.fieldGroup">
              <div v-for="row in selectionInfo" :key="row.label" :class="$style.readonly">
                <span :class="$style.readonlyLabel">{{ row.label }}</span>
                <span :class="$style.readonlyValue">{{ row.value }}</span>
              </div>
            </div>
          </KrCollapsible>
        </template>

        <!-- ── Face properties ── -->
        <template v-if="isFace">
          <KrCollapsible label="Геометрия" :open="true">
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
          </KrCollapsible>
        </template>

        <!-- ── Edge properties ── -->
        <template v-if="isEdge">
          <KrCollapsible label="Геометрия" :open="true">
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
          </KrCollapsible>
        </template>

        <!-- ── Vertex properties ── -->
        <template v-if="isVertex">
          <KrCollapsible label="Геометрия" :open="true">
            <div :class="$style.fieldGroup">
              <div :class="$style.readonly">
                <span :class="$style.readonlyLabel">Тело</span>
                <span :class="$style.readonlyValue">{{ panel.mode.value.type === 'vertex' ? names.bodyLabel(panel.mode.value.props.bodyId) : '' }}</span>
              </div>
            </div>
          </KrCollapsible>
        </template>
      </div>

      <!-- Data tab -->
      <div v-else-if="activeTab === 'data'" :class="$style.body">
        <KrCollapsible label="Данные фичи" :open="true">
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
        </KrCollapsible>
      </div>
    </template>
  </div>
</template>

<style module>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--kr-surface-alt);
}

.body {
  flex: 1;
  overflow: auto;
  padding: var(--kr-spacing-sm) var(--kr-spacing-md);
}

.head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: var(--kr-spacing-sm) 0;
  margin-bottom: var(--kr-spacing-sm);
  border-bottom: 1px solid var(--kr-border-subtle);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--kr-primary);
  flex-shrink: 0;
}

.title {
  font-size: 13px;
  font-weight: var(--kr-font-weight-bold);
  color: var(--kr-text);
}

.kind {
  margin-left: auto;
  font-family: var(--kr-font-mono);
  font-size: 10px;
  color: var(--kr-text-muted);
}

.fieldGroup {
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-sm);
  padding-bottom: var(--kr-spacing-xs);
}

.readonly {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--kr-spacing-xs) 0;
  font-size: var(--kr-font-size-sm);
}

.readonlyLabel {
  color: var(--kr-text-secondary);
}

.readonlyValue {
  font-family: var(--kr-font-mono);
  font-size: var(--kr-font-size-sm);
  color: var(--kr-amber-strong);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actionBtn {
  cursor: pointer;
  align-self: flex-start;
  padding: 6px 12px;
  border: 1px solid var(--kr-primary);
  border-radius: var(--kr-radius-md);
  background: transparent;
  color: var(--kr-primary);
  font-size: var(--kr-font-size-sm);
  transition: background var(--kr-transition-fast);
}

.actionBtn:hover {
  background: var(--kr-primary-soft);
}

.autoHint {
  font-size: 11px;
  color: var(--kr-text-muted);
}

/* ── Placeholder ── */

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: var(--kr-spacing-xl);
  text-align: center;
}

.placeholderIcon {
  font-size: 32px;
  color: var(--kr-text-muted);
  margin-bottom: var(--kr-spacing-md);
}

.placeholderTitle {
  font-size: var(--kr-font-size-md);
  font-weight: var(--kr-font-weight-bold);
  color: var(--kr-text-secondary);
  margin-bottom: var(--kr-spacing-xs);
}

.placeholderHint {
  font-size: var(--kr-font-size-sm);
  color: var(--kr-text-muted);
  line-height: 1.5;
  max-width: 200px;
}
</style>
