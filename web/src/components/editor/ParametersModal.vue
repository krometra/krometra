<script setup lang="ts">
import { ref } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrInput from "@/components/ui/KrInput.vue";
import KrNumberInput from "@/components/ui/KrNumberInput.vue";
import { useParameters } from "@/composables/useParameters";

const emit = defineEmits<{ close: [] }>();

const paramsStore = useParameters();

const newParamName = ref("");
const newParamValue = ref(0);
const newParamUnit = ref("мм");
const editingParamId = ref<string | null>(null);

function resetForm() {
  editingParamId.value = null;
  newParamName.value = "";
  newParamValue.value = 0;
  newParamUnit.value = "мм";
}

function handleAdd() {
  const name = newParamName.value.trim();
  if (!name) return;
  paramsStore.add(name, newParamValue.value, newParamUnit.value);
  resetForm();
}

function handleNumberEnter(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement) handleAdd();
}

function handleEdit(id: string) {
  const p = paramsStore.parameters.value.find((x) => x.id === id);
  if (!p) return;
  editingParamId.value = id;
  newParamName.value = p.name;
  newParamValue.value = p.value;
  newParamUnit.value = p.unit;
}

function handleSaveEdit() {
  if (!editingParamId.value) return;
  const name = newParamName.value.trim();
  if (!name) return;
  paramsStore.update(editingParamId.value, {
    name,
    value: newParamValue.value,
    unit: newParamUnit.value,
  });
  resetForm();
}
</script>

<template>
  <div :class="$style.overlay" @click="emit('close')">
    <div :class="$style.modal" @click.stop>
      <div :class="$style.modalHead">
        <span :class="[$style.mono, $style.modalIcon]">ƒx</span>
        <span :class="$style.modalTitle">Параметры модели</span>
        <KrButton variant="ghost" size="sm" :class="$style.modalClose" aria-label="Закрыть параметры" @click="emit('close')">✕</KrButton>
      </div>
      <div :class="$style.modalCols">
        <span>ИМЯ</span><span>ЗНАЧЕНИЕ</span><span>ЕД.</span><span />
      </div>
      <div :class="$style.modalRows">
        <div
          v-for="p in paramsStore.parameters.value"
          :key="p.id"
          :class="$style.modalRow"
        >
          <template v-if="editingParamId === p.id">
            <KrInput
              v-model="newParamName"
              :class="$style.paramInput"
              placeholder="имя"
            />
            <KrNumberInput
              v-model="newParamValue"
              :class="$style.paramInput"
              placeholder="значение"
            />
            <select v-model="newParamUnit" :class="$style.paramSelect">
              <option>мм</option>
              <option>°</option>
              <option>безразм.</option>
            </select>
            <div :class="$style.paramActions">
              <KrButton variant="ghost" size="sm" :class="$style.paramSaveBtn" aria-label="Сохранить параметр" @click="handleSaveEdit">✓</KrButton>
              <KrButton variant="ghost" size="sm" :class="$style.paramCancelBtn" aria-label="Отменить редактирование" @click="resetForm">✕</KrButton>
            </div>
          </template>
          <template v-else>
            <span :class="$style.paramName">{{ p.name }}</span>
            <span :class="$style.paramValue">{{ p.value }}</span>
            <span :class="$style.paramUnit">{{ p.unit }}</span>
            <div :class="$style.paramActions">
              <KrButton variant="ghost" size="sm" :class="$style.paramEditBtn" :aria-label="`Изменить параметр ${p.name}`" @click="handleEdit(p.id)">✎</KrButton>
              <KrButton variant="ghost" size="sm" :class="$style.paramDelBtn" :aria-label="`Удалить параметр ${p.name}`" @click="paramsStore.remove(p.id)">🗑</KrButton>
            </div>
          </template>
        </div>
        <div v-if="paramsStore.count.value === 0 && !editingParamId" :class="$style.modalRow">
          <span :class="$style.emptyParamName">Нет параметров</span>
          <span :class="$style.paramExpr">—</span>
          <span :class="$style.paramValue">—</span>
          <span />
        </div>
        <div v-if="!editingParamId" :class="$style.modalRow">
          <KrInput
            v-model="newParamName"
            :class="$style.paramInput"
            placeholder="имя параметра"
            @keyup.enter="handleAdd"
          />
          <KrNumberInput
            v-model="newParamValue"
            :class="$style.paramInput"
            placeholder="значение"
            @keyup.enter="handleNumberEnter"
          />
          <select v-model="newParamUnit" :class="$style.paramSelect">
            <option>мм</option>
            <option>°</option>
            <option>безразм.</option>
          </select>
          <KrButton variant="ghost" size="sm" :class="$style.paramAddBtn" aria-label="Добавить параметр" @click="handleAdd">＋</KrButton>
        </div>
      </div>
      <div :class="$style.modalFoot">
        <span :class="$style.paramCount">{{ paramsStore.count.value }} параметров</span>
        <KrButton size="sm" :class="$style.doneBtn" @click="emit('close')">Готово</KrButton>
      </div>
    </div>
  </div>
</template>

<style module>
.overlay {
  position: fixed;
  inset: 0;
  background: var(--kr-overlay);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  width: 620px;
  border: 1px solid var(--kr-border-strong);
  border-radius: 14px;
  background: var(--kr-surface-raised);
  overflow: hidden;
  box-shadow: var(--kr-shadow-lg);
}

.modalHead {
  display: flex;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid var(--kr-border);
}

.mono {
  font-family: var(--kr-font-mono);
}

.modalIcon {
  color: var(--kr-amber-strong);
  margin-right: 9px;
}

.modalTitle {
  font-size: 16px;
  font-weight: var(--kr-font-weight-bold);
}

.modalClose.modalClose {
  margin-left: auto;
  color: var(--kr-text-secondary);
  font-size: 18px;
  min-height: 26px;
  width: 26px;
  padding: 0;
}

.modalClose.modalClose:hover {
  color: var(--kr-text);
}

.modalCols,
.modalRow {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr 0.8fr 0.8fr;
  align-items: center;
}

.modalCols {
  padding: 8px 22px 10px;
  font-family: var(--kr-font-mono);
  font-size: 11px;
  color: var(--kr-text-secondary);
  border-bottom: 1px solid var(--kr-border);
}

.modalRows {
  max-height: 280px;
  overflow: auto;
}

.modalRow {
  padding: 11px 22px;
  border-bottom: 1px solid var(--kr-border-subtle);
  font-size: 13px;
}

.modalRow:hover {
  background: var(--kr-surface-hover);
}

.paramName {
  font-family: var(--kr-font-mono);
  color: var(--kr-primary);
}

.emptyParamName {
  font-family: var(--kr-font-mono);
  color: var(--kr-text-muted);
}

.paramExpr {
  font-family: var(--kr-font-mono);
  color: var(--kr-text-secondary);
}

.paramValue {
  font-family: var(--kr-font-mono);
  font-weight: var(--kr-font-weight-medium);
}

.paramUnit {
  font-family: var(--kr-font-mono);
  color: var(--kr-amber-strong);
}

.paramInput {
  min-width: 0;
}

.paramSelect {
  min-width: 0;
  background: var(--kr-surface-sunken);
  border: 1px solid var(--kr-border-strong);
  border-radius: var(--kr-radius-sm);
  padding: 5px 8px;
  font-family: var(--kr-font-mono);
  font-size: 12px;
  color: var(--kr-text);
  cursor: pointer;
}

.paramActions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.paramEditBtn.paramEditBtn,
.paramDelBtn.paramDelBtn,
.paramSaveBtn.paramSaveBtn,
.paramCancelBtn.paramCancelBtn,
.paramAddBtn.paramAddBtn {
  width: 26px;
  min-height: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--kr-border);
  font-size: 13px;
  color: var(--kr-text-secondary);
}

.paramEditBtn.paramEditBtn:hover {
  color: var(--kr-primary);
  border-color: var(--kr-primary);
  background: var(--kr-primary-soft);
}

.paramDelBtn.paramDelBtn:hover {
  color: var(--kr-red-strong);
  border-color: var(--kr-error);
  background: var(--kr-surface-hover);
}

.paramSaveBtn.paramSaveBtn:hover {
  color: var(--kr-green-strong);
  border-color: var(--kr-green);
  background: var(--kr-surface-hover);
}

.paramCancelBtn.paramCancelBtn:hover {
  color: var(--kr-text);
  border-color: var(--kr-text-secondary);
}

.paramAddBtn.paramAddBtn {
  color: var(--kr-primary);
  border-color: var(--kr-primary-border);
  font-size: 16px;
}

.paramAddBtn.paramAddBtn:hover {
  background: var(--kr-primary-soft);
  border-color: var(--kr-primary);
}

.paramCount {
  font-family: var(--kr-font-mono);
  font-size: 12px;
  color: var(--kr-text-muted);
}

.modalFoot {
  padding: 14px 22px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-top: 1px solid var(--kr-border);
}

.doneBtn.doneBtn {
  margin-left: auto;
  font-weight: var(--kr-font-weight-bold);
  font-size: 13px;
  padding-inline: 18px;
}
</style>
