<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
import KrButton from "@/components/ui/KrButton.vue";

defineProps<{
  loading: boolean;
}>();

const emit = defineEmits<{
  import: [];
}>();
const { t } = useI18n();
</script>

<template>
  <KrButton
    variant="ghost"
    size="sm"
    :loading="loading"
    data-testid="import-step"
    :title="t('editor.importHint')"
    @click="emit('import')"
  >
    {{ t("editor.import") }}
  </KrButton>
</template>
