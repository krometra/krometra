<script setup lang="ts">
import KrButton from "@/components/ui/KrButton.vue";

defineProps<{
  loading: boolean;
}>();

const emit = defineEmits<{
  import: [];
}>();
</script>

<template>
  <KrButton
    variant="ghost"
    size="sm"
    :loading="loading"
    data-testid="import-step"
    title="Импортировать тела из файла .step или .stp"
    @click="emit('import')"
  >
    Импорт STEP ↑
  </KrButton>
</template>
