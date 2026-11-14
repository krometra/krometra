<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
const { t } = useI18n();
import KrButton from "@/components/ui/KrButton.vue";
import KrDialog from "@/components/ui/KrDialog.vue";
import type { PendingSketchDelete } from "@/composables/editor/useTimelineEdits";

defineProps<{ pending: PendingSketchDelete | null }>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <KrDialog :open="pending !== null" @update:open="emit('cancel')">
    <template #title>{{ t("editorPanels.delete_sketch_title") }}</template>
    <div data-testid="sketch-delete-dialog">
      <p :class="$style.text">
        {{ t("editorPanels.delete_sketch_text", { name: pending?.label ?? "" }) }}
      </p>
      <ul :class="$style.list">
        <li v-for="name in pending?.dependents ?? []" :key="name">{{ name }}</li>
      </ul>
    </div>
    <template #footer>
      <KrButton variant="secondary" size="md" @click="emit('cancel')">{{ t("editorPanels.cancel") }}</KrButton>
      <KrButton variant="danger" size="md" @click="emit('confirm')">{{ t("editorPanels.delete_sketch") }}</KrButton>
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
