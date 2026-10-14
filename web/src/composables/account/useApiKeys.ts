import { computed, ref } from "vue";
import { useApi } from "@/composables/useApi";
import { isAtKeyLimit, withoutSecret } from "@/lib/apiKeys";
import type { ApiKey, ApiKeyCreated, ApiKeyListResponse } from "@/types/api";

const ENDPOINT = "/auth/api-keys/";

export type ApiKeysClient = Pick<ReturnType<typeof useApi>, "get" | "post" | "delete">;

export function useApiKeys(api: ApiKeysClient = useApi()) {
  const keys = ref<ApiKey[]>([]);
  const loading = ref(false);
  const loadFailure = ref<unknown>(null);
  const revealed = ref<ApiKeyCreated | null>(null);
  const atLimit = computed(() => isAtKeyLimit(keys.value));

  async function load(): Promise<void> {
    loading.value = true;
    loadFailure.value = null;
    try {
      keys.value = (await api.get<ApiKeyListResponse>(ENDPOINT)).api_keys;
    } catch (error) {
      loadFailure.value = error;
    } finally {
      loading.value = false;
    }
  }

  async function create(name: string): Promise<void> {
    const created = await api.post<ApiKeyCreated>(ENDPOINT, { name: name.trim() });
    revealed.value = created;
    keys.value = [withoutSecret(created), ...keys.value];
  }

  async function remove(id: string): Promise<void> {
    await api.delete<void>(`${ENDPOINT}${encodeURIComponent(id)}`);
    keys.value = keys.value.filter((key) => key.id !== id);
    if (revealed.value?.id === id) revealed.value = null;
  }

  function dismissRevealed(): void {
    revealed.value = null;
  }

  return { keys, loading, loadFailure, revealed, atLimit, load, create, remove, dismissRevealed };
}
