import { ref, shallowRef, watch } from "vue";
import { useApi } from "@/composables/useApi";
import type { AdminOverview } from "@/types/api";
import type { AdminClient } from "./useAdminTable";

export const ADMIN_PERIODS = [7, 30, 90] as const;
export type AdminPeriod = (typeof ADMIN_PERIODS)[number];

export function useAdminOverview(initialPeriod: AdminPeriod = 30, api: Pick<AdminClient, "get"> = useApi()) {
  const period = ref<AdminPeriod>(initialPeriod);
  const overview = shallowRef<AdminOverview | null>(null);
  const loading = ref(false);
  const failure = shallowRef<unknown>(null);
  let request = 0;

  async function load() {
    const current = ++request;
    loading.value = true;
    failure.value = null;
    try {
      const result = await api.get<AdminOverview>(`/admin/overview?days=${period.value}`);
      if (current === request) overview.value = result;
    } catch (error) {
      if (current === request) failure.value = error;
    } finally {
      if (current === request) loading.value = false;
    }
  }

  function setPeriod(value: AdminPeriod) {
    period.value = value;
  }

  watch(period, load);

  return { period, overview, loading, failure, load, setPeriod };
}
