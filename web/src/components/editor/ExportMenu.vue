<script setup lang="ts">
import { watch } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsMenu from "@/components/ui/CsMenu.vue";
import { toast } from "@/composables/useToast";

const props = defineProps<{
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  "export-stl": [];
  "export-step": [];
}>();

const menuItems = [
  {
    id: "step",
    label: "STEP (.step)",
    action: () => {
      if (!props.loading) emit("export-step");
    },
  },
  {
    id: "stl",
    label: "STL (.stl)",
    action: () => {
      if (!props.loading) emit("export-stl");
    },
  },
];

watch(
  () => props.error,
  (val) => {
    if (val) toast(val, "error");
  }
);
</script>

<template>
  <CsMenu :items="menuItems">
    <CsButton variant="ghost" size="sm" :loading="loading">
      Экспорт ↓
    </CsButton>
  </CsMenu>
</template>
