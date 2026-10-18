<script setup lang="ts">
import KrButton from "@/components/ui/KrButton.vue";
import KrDialog from "@/components/ui/KrDialog.vue";
import type { PendingPlaneDelete } from "@/composables/editor/useWorkPlanes";

defineProps<{ pending: PendingPlaneDelete | null }>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <KrDialog :open="pending !== null" @update:open="emit('cancel')">
    <template #title>Удалить плоскость?</template>
    <div data-testid="work-plane-delete-dialog">
      <p :class="$style.text">
        На плоскости «{{ pending?.label }}» построены эскизы. Они останутся на месте, но перестанут следовать за плоскостью
        и её опорами. Вернуть всё можно через Ctrl+Z.
      </p>
      <ul :class="$style.list">
        <li v-for="name in pending?.sketches ?? []" :key="name">{{ name }}</li>
      </ul>
    </div>
    <template #footer>
      <KrButton variant="secondary" size="md" @click="emit('cancel')">Отмена</KrButton>
      <KrButton variant="danger" size="md" data-testid="work-plane-delete-confirm" @click="emit('confirm')">Удалить плоскость</KrButton>
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
