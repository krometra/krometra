<script setup lang="ts">
import { watch } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsMenu from "@/components/ui/CsMenu.vue";
import type { MeshFormat } from "@/composables/editor/exportSource";
import { toast } from "@/composables/useToast";

const props = defineProps<{
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  "export-step": [];
  "export-mesh": [format: MeshFormat];
}>();

function whenIdle(run: () => void) {
  return () => {
    if (!props.loading) run();
  };
}

const menuItems = [
  { id: "step", label: "STEP (.step)", action: whenIdle(() => emit("export-step")) },
  { id: "stl", label: "STL (.stl)…", action: whenIdle(() => emit("export-mesh", "stl")) },
  { id: "3mf", label: "3MF (.3mf)…", action: whenIdle(() => emit("export-mesh", "3mf")) },
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
