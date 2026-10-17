<script setup lang="ts">
import CsButton from "@/components/ui/CsButton.vue";
import CsDialog from "@/components/ui/CsDialog.vue";
import type { PendingPlaneDelete } from "@/composables/editor/useWorkPlanes";

defineProps<{ pending: PendingPlaneDelete | null }>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <CsDialog :open="pending !== null" @update:open="emit('cancel')">
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
      <CsButton variant="secondary" size="md" @click="emit('cancel')">Отмена</CsButton>
      <CsButton variant="danger" size="md" data-testid="work-plane-delete-confirm" @click="emit('confirm')">Удалить плоскость</CsButton>
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
