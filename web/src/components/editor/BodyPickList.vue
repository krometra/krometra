<script setup lang="ts">
import CsButton from "@/components/ui/CsButton.vue";
import CsIcon from "@/components/ui/CsIcon.vue";
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
      <CsButton
        variant="ghost"
        size="sm"
        :aria-label="`Убрать из списка: ${names.bodyLabel(bodyId)}`"
        :data-testid="`${testId}-remove`"
        @click="emit('remove', bodyId)"
      >
        <CsIcon name="close" :size="12" />
      </CsButton>
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
  border: 1px solid var(--cs-border);
  border-radius: var(--cs-radius-md);
  background: var(--cs-surface-sunken);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--cs-spacing-sm);
  padding: 0 var(--cs-spacing-xs) 0 var(--cs-spacing-sm);
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
}

.row + .row {
  border-top: 1px solid var(--cs-border-subtle);
}

.row:hover {
  background: var(--cs-surface-hover);
  color: var(--cs-text);
}

.index {
  flex-shrink: 0;
  min-width: var(--cs-spacing-md);
  font-family: var(--cs-font-mono);
  color: var(--cs-text-muted);
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
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-muted);
  font-style: italic;
}
</style>
