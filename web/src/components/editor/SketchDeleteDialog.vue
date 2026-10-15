<script setup lang="ts">
import CsButton from "@/components/ui/CsButton.vue";
import CsDialog from "@/components/ui/CsDialog.vue";
import type { PendingSketchDelete } from "@/composables/editor/useTimelineEdits";

defineProps<{ pending: PendingSketchDelete | null }>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <CsDialog :open="pending !== null" @update:open="emit('cancel')">
    <template #title>Удалить эскиз?</template>
    <div data-testid="sketch-delete-dialog">
      <p :class="$style.text">
        От эскиза «{{ pending?.label }}» зависят операции. После удаления они останутся в истории с ошибкой «эскиз не найден»,
        остальная модель перестроится без них. Вернуть всё можно через Ctrl+Z.
      </p>
      <ul :class="$style.list">
        <li v-for="name in pending?.dependents ?? []" :key="name">{{ name }}</li>
      </ul>
    </div>
    <template #footer>
      <CsButton variant="secondary" size="md" @click="emit('cancel')">Отмена</CsButton>
      <CsButton variant="danger" size="md" @click="emit('confirm')">Удалить эскиз</CsButton>
    </template>
  </CsDialog>
</template>

<style module>
.text {
  margin: 0 0 8px;
  color: var(--cs-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.list {
  margin: 0;
  padding-left: 20px;
  color: var(--cs-text);
  font-size: 13px;
}
</style>
