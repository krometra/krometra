<script setup lang="ts">
import { ref } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsInput from "@/components/ui/CsInput.vue";
import CsNumberInput from "@/components/ui/CsNumberInput.vue";
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
        <CsButton variant="ghost" size="sm" :class="$style.modalClose" aria-label="Закрыть параметры" @click="emit('close')">✕</CsButton>
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
            <CsInput
              v-model="newParamName"
              :class="$style.paramInput"
              placeholder="имя"
            />
            <CsNumberInput
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
              <CsButton variant="ghost" size="sm" :class="$style.paramSaveBtn" aria-label="Сохранить параметр" @click="handleSaveEdit">✓</CsButton>
              <CsButton variant="ghost" size="sm" :class="$style.paramCancelBtn" aria-label="Отменить редактирование" @click="resetForm">✕</CsButton>
            </div>
          </template>
          <template v-else>
            <span :class="$style.paramName">{{ p.name }}</span>
            <span :class="$style.paramValue">{{ p.value }}</span>
            <span :class="$style.paramUnit">{{ p.unit }}</span>
            <div :class="$style.paramActions">
              <CsButton variant="ghost" size="sm" :class="$style.paramEditBtn" :aria-label="`Изменить параметр ${p.name}`" @click="handleEdit(p.id)">✎</CsButton>
              <CsButton variant="ghost" size="sm" :class="$style.paramDelBtn" :aria-label="`Удалить параметр ${p.name}`" @click="paramsStore.remove(p.id)">🗑</CsButton>
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
          <CsInput
            v-model="newParamName"
            :class="$style.paramInput"
            placeholder="имя параметра"
            @keyup.enter="handleAdd"
          />
          <CsNumberInput
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
          <CsButton variant="ghost" size="sm" :class="$style.paramAddBtn" aria-label="Добавить параметр" @click="handleAdd">＋</CsButton>
        </div>
      </div>
      <div :class="$style.modalFoot">
        <span :class="$style.paramCount">{{ paramsStore.count.value }} параметров</span>
        <CsButton size="sm" :class="$style.doneBtn" @click="emit('close')">Готово</CsButton>
      </div>
    </div>
  </div>
</template>

<style module>
.overlay {
  position: fixed;
  inset: 0;
  background: var(--cs-overlay);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  width: 620px;
  border: 1px solid var(--cs-border-strong);
  border-radius: 14px;
  background: var(--cs-surface-raised);
  overflow: hidden;
  box-shadow: var(--cs-shadow-lg);
}

.modalHead {
  display: flex;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid var(--cs-border);
}

.mono {
  font-family: var(--cs-font-mono);
}

.modalIcon {
  color: var(--cs-amber-strong);
  margin-right: 9px;
}

.modalTitle {
  font-size: 16px;
  font-weight: var(--cs-font-weight-bold);
}

.modalClose.modalClose {
  margin-left: auto;
  color: var(--cs-text-secondary);
  font-size: 18px;
  min-height: 26px;
  width: 26px;
  padding: 0;
}

.modalClose.modalClose:hover {
  color: var(--cs-text);
}

.modalCols,
.modalRow {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr 0.8fr 0.8fr;
  align-items: center;
}

.modalCols {
  padding: 8px 22px 10px;
  font-family: var(--cs-font-mono);
  font-size: 11px;
  color: var(--cs-text-secondary);
  border-bottom: 1px solid var(--cs-border);
}

.modalRows {
  max-height: 280px;
  overflow: auto;
}

.modalRow {
  padding: 11px 22px;
  border-bottom: 1px solid var(--cs-border-subtle);
  font-size: 13px;
}

.modalRow:hover {
  background: var(--cs-surface-hover);
}

.paramName {
  font-family: var(--cs-font-mono);
  color: var(--cs-primary);
}

.emptyParamName {
  font-family: var(--cs-font-mono);
  color: var(--cs-text-muted);
}

.paramExpr {
  font-family: var(--cs-font-mono);
  color: var(--cs-text-secondary);
}

.paramValue {
  font-family: var(--cs-font-mono);
  font-weight: var(--cs-font-weight-medium);
}

.paramUnit {
  font-family: var(--cs-font-mono);
  color: var(--cs-amber-strong);
}

.paramInput {
  min-width: 0;
}

.paramSelect {
  min-width: 0;
  background: var(--cs-surface-sunken);
  border: 1px solid var(--cs-border-strong);
  border-radius: var(--cs-radius-sm);
  padding: 5px 8px;
  font-family: var(--cs-font-mono);
  font-size: 12px;
  color: var(--cs-text);
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
  border: 1px solid var(--cs-border);
  font-size: 13px;
  color: var(--cs-text-secondary);
}

.paramEditBtn.paramEditBtn:hover {
  color: var(--cs-primary);
  border-color: var(--cs-primary);
  background: var(--cs-primary-soft);
}

.paramDelBtn.paramDelBtn:hover {
  color: var(--cs-red-strong);
  border-color: var(--cs-error);
  background: var(--cs-surface-hover);
}

.paramSaveBtn.paramSaveBtn:hover {
  color: var(--cs-green-strong);
  border-color: var(--cs-green);
  background: var(--cs-surface-hover);
}

.paramCancelBtn.paramCancelBtn:hover {
  color: var(--cs-text);
  border-color: var(--cs-text-secondary);
}

.paramAddBtn.paramAddBtn {
  color: var(--cs-primary);
  border-color: var(--cs-primary-border);
  font-size: 16px;
}

.paramAddBtn.paramAddBtn:hover {
  background: var(--cs-primary-soft);
  border-color: var(--cs-primary);
}

.paramCount {
  font-family: var(--cs-font-mono);
  font-size: 12px;
  color: var(--cs-text-muted);
}

.modalFoot {
  padding: 14px 22px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-top: 1px solid var(--cs-border);
}

.doneBtn.doneBtn {
  margin-left: auto;
  font-weight: var(--cs-font-weight-bold);
  font-size: 13px;
  padding-inline: 18px;
}
</style>
