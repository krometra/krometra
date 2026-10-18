<script setup lang="ts">
import KrButton from "@/components/ui/KrButton.vue";
import KrIcon from "@/components/ui/KrIcon.vue";
import { useDisplayNames } from "@/composables/useDisplayNames";

defineProps<{
  bodyIds: string[];
  empty: string;
  testId: string;
}>();

const emit = defineEmits<{ remove: [bodyId: string] }>();

const names = useDisplayNames();
</script>

<template>
  <ul v-if="bodyIds.length > 0" :class="$style.list" :data-testid="testId">
    <li v-for="(bodyId, index) in bodyIds" :key="bodyId" :class="$style.row" :data-testid="`${testId}-row`" :data-body-id="bodyId">
      <span :class="$style.index">{{ index + 1 }}</span>
      <span :class="$style.label">{{ names.bodyLabel(bodyId) }}</span>
      <KrButton
        variant="ghost"
        size="sm"
        :aria-label="`Убрать из списка: ${names.bodyLabel(bodyId)}`"
        :data-testid="`${testId}-remove`"
        @click="emit('remove', bodyId)"
      >
        <KrIcon name="close" :size="12" />
      </KrButton>
    </li>
  </ul>
  <p v-else :class="$style.empty" :data-testid="`${testId}-empty`">{{ empty }}</p>
</template>

<style module>
.list {
  max-height: 168px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--kr-border);
  border-radius: var(--kr-radius-md);
  background: var(--kr-surface-sunken);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--kr-spacing-sm);
  padding: 0 var(--kr-spacing-xs) 0 var(--kr-spacing-sm);
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-secondary);
}

.row + .row {
  border-top: 1px solid var(--kr-border-subtle);
}

.row:hover {
  background: var(--kr-surface-hover);
  color: var(--kr-text);
}

.index {
  flex-shrink: 0;
  min-width: var(--kr-spacing-md);
  font-family: var(--kr-font-mono);
  color: var(--kr-text-muted);
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  margin: 0;
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-muted);
  font-style: italic;
}
</style>
