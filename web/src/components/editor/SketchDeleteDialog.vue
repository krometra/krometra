<script setup lang="ts">
import KrButton from "@/components/ui/KrButton.vue";
import KrDialog from "@/components/ui/KrDialog.vue";
import type { PendingSketchDelete } from "@/composables/editor/useTimelineEdits";

defineProps<{ pending: PendingSketchDelete | null }>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <KrDialog :open="pending !== null" @update:open="emit('cancel')">
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
      <KrButton variant="secondary" size="md" @click="emit('cancel')">Отмена</KrButton>
      <KrButton variant="danger" size="md" @click="emit('confirm')">Удалить эскиз</KrButton>
    </template>
  </KrDialog>
</template>

<style module>
.text {
  margin: 0 0 8px;
  color: var(--kr-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.list {
  margin: 0;
  padding-left: 20px;
  color: var(--kr-text);
  font-size: 13px;
}
</style>
