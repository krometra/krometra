<script setup lang="ts">
import { errorMessage } from "@/lib/apiError";
import { formatCount } from "@/lib/admin/format";
import CsInput from "@/components/ui/CsInput.vue";

defineProps<{ search: string; placeholder: string; total: number; failure: unknown; failureText: string }>();
defineEmits<{ search: [value: string] }>();
</script>

<template>
  <div :class="$style.root">
    <div :class="$style.toolbar">
      <CsInput :model-value="search" :placeholder="placeholder" :class="$style.search" @update:model-value="$emit('search', $event)" />
      <span :class="$style.total">Всего: {{ formatCount(total) }}</span>
    </div>
    <p v-if="failure" :class="$style.failure" role="alert">{{ errorMessage(failure, failureText) }}</p>
  </div>
</template>

<style module>
.root {
  display: flex;
  flex-direction: column;
  gap: var(--cs-spacing-sm);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--cs-spacing-md);
}

.search {
  flex: 1;
  max-width: 360px;
}

.total {
  color: var(--cs-text-secondary);
  font-size: var(--cs-font-size-sm);
}

.failure {
  margin: 0;
  color: var(--cs-error);
  font-size: var(--cs-font-size-sm);
}
</style>
