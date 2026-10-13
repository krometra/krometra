<script setup lang="ts">
import CsButton from "@/components/ui/CsButton.vue";

defineProps<{
  loading: boolean;
}>();

const emit = defineEmits<{
  import: [];
}>();
</script>

<template>
  <CsButton
    variant="ghost"
    size="sm"
    :loading="loading"
    data-testid="import-step"
    title="Импортировать тела из файла .step или .stp"
    @click="emit('import')"
  >
    Импорт STEP ↑
  </CsButton>
</template>
