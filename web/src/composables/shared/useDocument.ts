// Shared document state (createSharedComposable — singleton per project)

import { ref, computed } from "vue";
import { createSharedComposable } from "@vueuse/core";
import type { Document, DocumentUpdate } from "@/types/api";
import { useApi } from "../useApi";

export const useDocument = createSharedComposable(() => {
  const document = ref<Document | null>(null);
  const version = computed(() => document.value?.version ?? 0);
  const isDirty = ref(false);
  const conflict = ref(false);
  const isLoading = ref(false);

  async function load(projectId: string) {
    isLoading.value = true;
    try {
      const api = useApi();
      const data = await api.get<Document>(`/projects/${projectId}/document`);
      document.value = data;
      isDirty.value = false;
      conflict.value = false;
    } catch {
      // Error loading document — leave current state
    } finally {
      isLoading.value = false;
    }
  }

  async function save(projectId: string) {
    if (!document.value || !isDirty.value) return;

    isLoading.value = true;
    try {
      const api = useApi();
      const payload: DocumentUpdate = {
        components: document.value.components,
        timeline: document.value.timeline,
        metadata: document.value.metadata,
        version: document.value.version,
      };
      const data = await api.put<Document>(`/projects/${projectId}/document`, payload);
      document.value = data;
      isDirty.value = false;
      conflict.value = false;
    } catch (e: unknown) {
      const err = e as { error?: string };
      if (err.error === "version_conflict") {
        conflict.value = true;
      }
      // Don't clear isDirty on conflict — keep dirty state
    } finally {
      isLoading.value = false;
    }
  }

  function markDirty() {
    isDirty.value = true;
  }

  return {
    document,
    version,
    isDirty,
    conflict,
    isLoading,
    load,
    save,
    markDirty,
  };
});
