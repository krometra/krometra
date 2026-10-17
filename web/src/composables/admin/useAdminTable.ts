import { ref, shallowRef, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { useApi } from "@/composables/useApi";
import { applySearch, applySort, listQuery, type SortOrder, type TableState } from "@/lib/admin/tableQuery";

export type AdminClient = Pick<ReturnType<typeof useApi>, "get" | "patch">;

interface Page<Row> {
  items: Row[];
  total: number;
}

const SEARCH_DEBOUNCE_MS = 300;

export function useAdminTable<S extends string, Row extends { id: string }>(
  endpoint: string,
  initial: TableState<S>,
  sorts: readonly S[],
  api: AdminClient = useApi(),
) {
  const state = shallowRef<TableState<S>>(initial);
  const search = ref(initial.q);
  const rows = shallowRef<Row[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const failure = shallowRef<unknown>(null);
  let request = 0;

  async function load() {
    const current = ++request;
    loading.value = true;
    failure.value = null;
    try {
      const page = await api.get<Page<Row>>(`${endpoint}?${listQuery(state.value)}`);
      if (current !== request) return;
      rows.value = page.items;
      total.value = page.total;
    } catch (error) {
      if (current === request) failure.value = error;
    } finally {
      if (current === request) loading.value = false;
    }
  }

  const applySearchDebounced = useDebounceFn((q: string) => {
    state.value = applySearch(state.value, q);
  }, SEARCH_DEBOUNCE_MS);

  function setSearch(q: string) {
    search.value = q;
    void applySearchDebounced(q);
  }

  function setSortKey(sort: string) {
    state.value = applySort(state.value, sort, state.value.order, sorts);
  }

  function setSortOrder(order: SortOrder) {
    state.value = applySort(state.value, state.value.sort, order, sorts);
  }

  function setPage(page: number) {
    state.value = { ...state.value, page };
  }

  function patchRow(id: string, patch: Partial<Row>) {
    rows.value = rows.value.map((row) => (row.id === id ? { ...row, ...patch } : row));
  }

  watch(state, load);

  return { state, search, rows, total, loading, failure, load, setSearch, setSortKey, setSortOrder, setPage, patchRow };
}
