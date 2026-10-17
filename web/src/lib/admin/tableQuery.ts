export type SortOrder = "asc" | "desc";

export interface TableState<S extends string> {
  sort: S;
  order: SortOrder;
  page: number;
  pageSize: number;
  q: string;
}

export const MAX_PAGE_SIZE = 200;

export function offsetOf(page: number, pageSize: number): number {
  return Math.max(0, page - 1) * pageSize;
}

export function listQuery<S extends string>(state: TableState<S>): string {
  const pageSize = Math.min(Math.max(1, state.pageSize), MAX_PAGE_SIZE);
  const params = new URLSearchParams({
    limit: String(pageSize),
    offset: String(offsetOf(state.page, pageSize)),
    sort: state.sort,
    order: state.order,
  });
  const q = state.q.trim();
  if (q) params.set("q", q);
  return params.toString();
}

export function applySort<S extends string>(state: TableState<S>, sort: string, order: SortOrder, allowed: readonly S[]): TableState<S> {
  if (!allowed.includes(sort as S)) return state;
  return { ...state, sort: sort as S, order, page: 1 };
}

export function applySearch<S extends string>(state: TableState<S>, q: string): TableState<S> {
  return { ...state, q, page: 1 };
}
