<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { useApi } from "@/composables/useApi";
import PartPlaceholder from "@/components/viewport/PartPlaceholder.vue";

const props = defineProps<{ projectId: string; topColor?: string }>();

const api = useApi();
const url = ref<string | null>(null);
const failed = ref(false);

function revoke() {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = null;
}

async function load(projectId: string) {
  revoke();
  failed.value = false;
  try {
    const { blob } = await api.blob(`/projects/${projectId}/thumbnail`);
    if (blob.size === 0) throw new Error("empty");
    url.value = URL.createObjectURL(blob);
  } catch {
    failed.value = true;
  }
}

watch(() => props.projectId, load, { immediate: true });
onUnmounted(revoke);
</script>

<template>
  <img v-if="url && !failed" :src="url" :class="$style.image" alt="" loading="lazy" />
  <PartPlaceholder v-else variant="thumbnail" :top-color="topColor" />
</template>

<style module>
.image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: var(--cs-surface-2);
}
</style>
